import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useTheme } from '../../shared/context/ThemeContext';
import { useAuth } from '../../shared/context/AuthContext';
import { Moon, Sun, Loader2, X, ZoomIn, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, ShieldAlert, Calculator as CalculatorIcon, Play, RotateCcw, Code2, WifiOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { useAntiCheat } from '../hooks/useAntiCheat';
import { QuizTimer } from '../components/QuizTimer';
import { Calculator } from '../../shared/components/Calculator';
import { MathText } from '../../shared/components/MathText';

const MCQTest = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { theme, setTheme } = useTheme();
    const { user, getServerTime } = useAuth();
    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

    const [questions, setQuestions] = useState<any[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState(1);
    // Persist answers: Record<questionId, selectedOptionT(number | number[] | string)>
    const [answers, setAnswers] = useState<Record<number, number | number[] | string>>({});
    const [selectedLanguages, setSelectedLanguages] = useState<Record<number, string>>({});
    const [codeExecutionStatus, setCodeExecutionStatus] = useState<Record<number, boolean>>({});
    const [executionOutput, setExecutionOutput] = useState<Record<number, { stdout: string; stderr: string; }>>({});
    const [isExecuting, setIsExecuting] = useState(false);

    // Results State
    const [showResults, setShowResults] = useState(false);
    const [score, setScore] = useState(0);

    const [loading, setLoading] = useState(true);
    const [testActive, setTestActive] = useState(false);
    const [attemptId, setAttemptId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [quizSettings, setQuizSettings] = useState<any>(null);
    const [showCalculator, setShowCalculator] = useState(false);

    // Security State
    const [isWindowFocused, setIsWindowFocused] = useState(true);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    // Network Status Listener
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // --- PERSISTENCE LOGIC START ---
    // 1. Restore Progress on Mount
    useEffect(() => {
        if (!user || !id || id === 'combined') return;

        const storageKey = `quiz_progress_${user.id}_${id}`;
        try {
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const parsed = JSON.parse(savedData);
                if (parsed.answers) setAnswers(parsed.answers);
                // Logic to set selectedLanguages if it exists
                if (parsed.selectedLanguages) setSelectedLanguages(parsed.selectedLanguages);
                if (parsed.codeExecutionStatus) setCodeExecutionStatus(parsed.codeExecutionStatus);
                // Optional: Restore current question to where they left off
                if (parsed.currentQuestion) setCurrentQuestion(parsed.currentQuestion);

                // console.log("Restored quiz progress from local storage");
            }
        } catch (e) {
            console.error("Failed to restore quiz progress", e);
        }
    }, [id, user]);

    // 2. Save Progress on Change
    useEffect(() => {
        if (!user || !id || id === 'combined' || showResults || loading) return;

        const storageKey = `quiz_progress_${user.id}_${id}`;
        const dataToSave = {
            answers,
            selectedLanguages,
            codeExecutionStatus,
            currentQuestion,
            updatedAt: Date.now()
        };

        const timeoutId = setTimeout(() => {
            localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        }, 500); // Debounce save by 500ms

        return () => clearTimeout(timeoutId);
    }, [answers, selectedLanguages, codeExecutionStatus, currentQuestion, id, user, showResults, loading]);
    // --- PERSISTENCE LOGIC END ---



    // Helper: finish test (Defined before useAntiCheat to be safe, though hoisting applies to functions not consts. 
    // We define it as const inside render, so it must be defined before use)
    // Actually, onAutoSubmit calls it. onAutoSubmit is a callback. 
    // The safest way with const is to rely on closure capture or define it early.
    // However, it depends on state like questions/answers.
    // It's circular if onAutoSubmit calls it but it relies on state.
    // The standard way is defining it here.

    // We need to define calculateAndShowResults BEFORE useAntiCheat if we pass it directly.
    // But since useAntiCheat is a hook, we pass a closure `() => calculateAndShowResults()`.
    // The closure captures the variable. The variable must be initialized by the time the callback executes.
    // It will be.

    // BUT! I will define it first to be clean.

    // Save Progress (Debounced)
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Save Progress (Debounced)
    // Save Progress (Debounced)
    const saveProgress = useCallback((currentAnswers: any) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            try {
                if (!user || !id || id === 'combined' || !testActive) return;

                // Retrieve active attempt ID from state or localStorage
                const activeAttemptId = attemptId || localStorage.getItem(`attempt_id_${user.id}_${id}`);
                if (!activeAttemptId) {
                    console.warn("Cannot autosave answers: No active attempt ID found.");
                    return;
                }

                console.log(`Auto-saving draft for attempt ${activeAttemptId}...`);
                
                // Map all answer values to standard strings for database safety
                const answersMap: Record<string, string> = {};
                Object.entries(currentAnswers).forEach(([qNum, val]) => {
                    const question = questions.find(q => q.id === Number(qNum));
                    if (question) {
                        answersMap[question.dbId] = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    }
                });

                await api.put(`/attempts/${activeAttemptId}/autosave`, {
                    answers: answersMap
                });
            } catch (err) {
                console.error("Failed to save draft via secure API:", err);
            }
        }, 2000);
    }, [id, testActive, attemptId, user, questions]);

    const calculateAndShowResults = useCallback(async () => {
        setIsSubmitting(true);
        setTestActive(false);
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(err => console.log(err));
        }

        try {
            if (!user || !id || id === 'combined') {
                setShowResults(true);
                return;
            }

            // ZERO-TRUST SECURE GRADING VIA MONOLITHIC BACKEND
            const answerPayload: Record<string, string> = {};
            questions.forEach(q => {
                const userAnswer = answers[q.id];
                if (userAnswer !== undefined && userAnswer !== null) {
                    answerPayload[q.dbId] = typeof userAnswer === 'object' ? JSON.stringify(userAnswer) : String(userAnswer);
                }
            });

            const activeAttemptId = attemptId || localStorage.getItem(`attempt_id_${user.id}_${id}`);
            if (!activeAttemptId) {
                throw new Error("No active exam attempt ID found for submission.");
            }

            console.log(`Submitting and grading attempt ${activeAttemptId} securely on server...`);
            const submitData = await api.post(`/attempts/${activeAttemptId}/submit`, {
                answers: answerPayload
            });

            if (submitData && submitData.success) {
                setScore(submitData.score);
            }
            setShowResults(true);

            // Clear progress local storage
            localStorage.removeItem(`quiz_progress_${user.id}_${id}`);
            localStorage.removeItem(`attempt_id_${user.id}_${id}`);

        } catch (err: any) {
            console.error("Error saving results via secure API:", err);
            setShowResults(true);
        }
    }, [answers, questions, id, attemptId, user]);

    // Security Focus State (For UI overlays only)
    useEffect(() => {
        const handleFocus = () => setIsWindowFocused(true);
        const handleBlur = () => setIsWindowFocused(false);
        
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) setIsWindowFocused(false);
            else setIsWindowFocused(true);
        });

        return () => {
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    // Anti-Cheat Integration
    const {
        isFullScreen,
        warning,
        enterFullScreen
    } = useAntiCheat({
        enabled: testActive && !showResults,
        level: quizSettings?.antiCheatLevel || (quizSettings?.isMaster ? 'strict' : 'standard'), // Master tests default to strict
        maxViolations: quizSettings?.maxViolations || 3,
        onViolation: async (count, type) => {
            console.warn(`Anti-cheat violation detected: ${type} (Strike ${count})`);
            try {
                const activeAttemptId = attemptId || localStorage.getItem(`attempt_id_${user.id}_${id}`);
                if (activeAttemptId) {
                    // Map human-readable violation descriptions to standard technical flags
                    let flag = 'unknown_violation';
                    const lowerType = type.toLowerCase();
                    if (lowerType.includes('full screen')) flag = 'fullscreen_exit';
                    else if (lowerType.includes('tab') || lowerType.includes('hidden') || lowerType.includes('focus')) flag = 'tab_switch';
                    else if (lowerType.includes('keyboard') || lowerType.includes('shortcut')) flag = 'restricted_key';
                    else if (lowerType.includes('multi-touch')) flag = 'multi_touch';

                    await api.post(`/attempts/${activeAttemptId}/telemetry`, {
                        flags: [flag]
                    });
                }
            } catch (err) {
                console.error("Failed to log telemetry violation via secure API:", err);
            }
        },
        onAutoSubmit: () => {
            // No alert here, overlay handles the visual feedback
            calculateAndShowResults();
        }
    });

    // Data Fetching
    useEffect(() => {
        const fetchQuestions = async () => {
            if (!id) return;

            try {
                let targetQuizIds: string[] = [];

                if (id === 'combined') {
                    const params = new URLSearchParams(window.location.search);
                    const idsParam = params.get('ids');
                    if (idsParam) {
                        targetQuizIds = idsParam.split(',');
                    } else {
                        navigate(-1);
                        return;
                    }
                } else {
                    targetQuizIds = [id];
                }

                const { data: quizData } = await supabase
                    .from('quizzes')
                    .select('settings, type, id')
                    .in('id', targetQuizIds)
                    .limit(1)
                    .single();

                if (quizData) {
                    if (quizData.settings) setQuizSettings(quizData.settings);

                    // --- SERVER-SIDE RETAKE GUARD (cannot bypass with incognito/localStorage clear) ---
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        const isMaster = quizData.type === 'master';
                        if (isMaster) {
                            // Check for COMPLETED attempts only
                            const { data: completedAttempts } = await supabase
                                .from('quiz_results')
                                .select('id')
                                .eq('quiz_id', quizData.id)
                                .eq('student_id', user.id)
                                .limit(1);

                            if (completedAttempts && completedAttempts.length > 0) {
                                alert("You have already completed this assessment.");
                                navigate(`/student/practice/${id}`);
                                return;
                            }

                            // Load Draft / In-Progress Attempt
                            const { data: draftAttempt } = await supabase
                                .from('attempts')
                                .select('id, answers, status')
                                .eq('quiz_id', quizData.id)
                                .eq('student_id', user.id)
                                .eq('status', 'in-progress')
                                .order('updated_at', { ascending: false }) // Get latest
                                .limit(1)
                                .single();

                            if (draftAttempt) {
                                if (draftAttempt.id) {
                                    setAttemptId(draftAttempt.id);
                                    localStorage.setItem(`attempt_id_${user.id}_${quizData.id}`, draftAttempt.id);
                                }
                                if (draftAttempt.answers) {
                                    console.log("Restoring Data:", draftAttempt.answers);
                                    setAnswers(draftAttempt.answers);
                                    // Optional: Restore other state if saved
                                }
                            }
                        }
                    }
                }

                let data: any[] = [];
                for (const quizId of targetQuizIds) {
                    try {
                        const secureQuestions = await api.get(`/quizzes/${quizId}/questions`);
                        data = [...data, ...(secureQuestions || [])];
                    } catch (err) {
                        console.error(`Failed to fetch secure questions for quiz ${quizId}:`, err);
                    }
                }

                if (data && data.length > 0) {
                    const mapped = data.map((q: any, index: number) => {
                        const parsedCorrect = (() => {
                            try {
                                return JSON.parse(q.correct_answer || '{}');
                            } catch { return null; }
                        })();

                        // Auto-detect range type if not explicitly set but data matches
                        let derivedType = (q.type || 'mcq').toLowerCase();
                        if (derivedType === 'mcq' && parsedCorrect && typeof parsedCorrect === 'object' && 'min' in parsedCorrect && 'max' in parsedCorrect) {
                            derivedType = 'range';
                        }

                        return {
                            id: index + 1,
                            dbId: q.id,
                            type: derivedType,
                            question: q.text,
                            imageUrl: q.image_url ? `${q.image_url}?t = ${Date.now()} ` : null,
                            options: q.choices || [], // Ensure array
                            correct: (() => {
                                try {
                                    if (derivedType === 'msq') return JSON.parse(q.correct_answer || '[]');
                                    if (derivedType === 'range') {
                                        if (parsedCorrect && typeof parsedCorrect === 'object' && 'min' in parsedCorrect) {
                                            return parsedCorrect;
                                        }
                                        return { min: 0, max: 0 };
                                    }
                                    if (derivedType === 'code') return parsedCorrect || {};
                                    return (Number(q.correct_answer) || 0);
                                } catch (e) {
                                    console.error("Error parsing answer for Q:", q.id, e);
                                    return derivedType === 'msq' ? [] : (derivedType === 'code' || derivedType === 'range') ? {} : 0;
                                }
                            })()
                        };
                    });
                    setQuestions(mapped);
                }
            } catch (err: any) {
                console.error("Error loading test:", err);
                
                // --- AUTO-SESSION REFRESH ON JWT EXPIRE ---
                const isAuthError = err.message?.toLowerCase().includes('jwt') || err.message?.toLowerCase().includes('unauthorized');
                if (isAuthError) {
                    console.warn("MCQTest: Detected expired session during fetch. Attempting refresh...");
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        console.log("MCQTest: Session refreshed. Retrying fetch...");
                        fetchQuestions(); // Retry
                        return;
                    }
                }
            } finally {
                setLoading(false);
            }
        };

        fetchQuestions();
    }, [id, navigate]);

    // Realtime Subscriptions
    useEffect(() => {
        if (!id || loading || showResults || id === 'combined') return;
        // Skip on iOS/Safari — WebSocket throws "The operation is insecure"
        if (typeof WebSocket === 'undefined') return;

        let channel: any = null;
        try {
            channel = supabase.channel(`quiz_session:${id}`, {
                config: { presence: { key: 'student' } },
            });

            channel
                .on('broadcast', { event: 'test_ended' }, () => {
                    alert('The teacher has ended this test session.');
                    calculateAndShowResults();
                })
                .on('broadcast', { event: 'test_paused' }, () => {
                    setTestActive(false);
                    setIsPaused(true);
                })
                .on('broadcast', { event: 'test_resumed' }, () => {
                    setIsPaused(false);
                    setTestActive(true);
                })
                .subscribe(async (status: string) => {
                    if (status === 'SUBSCRIBED') {
                        try {
                            const { data: { user } } = await supabase.auth.getUser();
                            if (user) await channel.track({ student_id: user.id, online_at: new Date().toISOString() });
                        } catch (e) {
                            console.warn('Presence tracking failed:', e);
                        }
                    }
                });
        } catch (err) {
            console.warn('Realtime subscription failed (will use polling fallback):', err);
        }

        return () => {
            if (channel) {
                try { supabase.removeChannel(channel); } catch (_) {}
            }
        };
    }, [id, loading, showResults, calculateAndShowResults]);

    const handleOptionSelect = useCallback((optionIndex: number) => {
        const currentQ = questions[currentQuestion - 1];
        if (currentQ.type === 'msq') {
            setAnswers(prev => {
                const current = (prev[currentQuestion] as number[]) || [];
                let next;
                if (current.includes(optionIndex)) {
                    next = { ...prev, [currentQuestion]: current.filter(i => i !== optionIndex) };
                } else {
                    next = { ...prev, [currentQuestion]: [...current, optionIndex] };
                }
                saveProgress(next);
                return next;
            });
        } else {
            setAnswers(prev => {
                const next = { ...prev, [currentQuestion]: optionIndex };
                saveProgress(next);
                return next;
            });
        }
    }, [currentQuestion, questions, saveProgress]);

    const handleRunCode = async () => {
        const q = questions[currentQuestion - 1];
        if (!q || q.type !== 'code') return;

        const studentCode = answers[q.id] as string || q.correct?.starterCode || '';
        const driverCode = q.correct?.driverCode || '';
        const codeToRun = driverCode ? `${studentCode}\n\n${driverCode}` : studentCode;

        const defaultLang = q.correct?.language || 'python';
        // Use user selected language OR default
        const language = selectedLanguages[q.id] || defaultLang;
        const testCases = q.correct?.testCases || [];

        setIsExecuting(true);
        setExecutionOutput(prev => ({ ...prev, [q.id]: { stdout: '', stderr: '' } }));

        try {
            // We only run the first test case or a sample for display, OR we run all and check correctness
            // For feedback, let's run the code against the first test case or just run it raw if no input?
            // A better UX is to have a "Run" button that just runs it, and internal "Grading" runs against test cases.
            // But here we want immediate feedback on "Correctness" potentially.

            // Let's run against ALL test cases to determine success.
            let allPassed = true;
            let combinedStdout = '';
            let combinedStderr = '';

            for (const testCase of testCases) {
                const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        language: language,
                        version: '*', // Piston will pick the latest
                        files: [{ content: codeToRun }],
                        stdin: testCase.input,
                    }),
                });

                const result = await response.json();
                const run = result.run;

                // Normalizing Output: Trim and Normalize Newlines
                const normalize = (str: string) => str.replace(/\r\n/g, '\n').trim();

                const output = normalize(run.stdout);
                const expected = normalize(testCase.output);

                combinedStdout += `Input: ${testCase.input} \nOutput: ${output} \nExpected: ${expected} \n\n`;
                if (run.stderr) combinedStderr += `Error: ${run.stderr} \n`;

                // Strict comparison of trimmed output
                if (output !== expected) {
                    allPassed = false;
                    combinedStdout += `\n[Test Failed]Expected: "${expected}", Got: "${output}"\n`;
                } else {
                    combinedStdout += `\n[Test Passed]\n`;
                }
            }

            // If no test cases, just run safely
            if (testCases.length === 0) {
                const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        language: language,
                        version: '*',
                        files: [{ content: codeToRun }],
                    }),
                });
                const result = await response.json();
                combinedStdout = result.run.stdout;
                combinedStderr = result.run.stderr;
                allPassed = true; // No tests to fail
            }

            setExecutionOutput(prev => ({ ...prev, [q.id]: { stdout: combinedStdout, stderr: combinedStderr } }));
            setCodeExecutionStatus(prev => ({ ...prev, [q.id]: allPassed }));

        } catch (err) {
            console.error(err);
            setExecutionOutput(prev => ({ ...prev, [q.id]: { stdout: '', stderr: 'Failed to execute code.' } }));
        } finally {
            setIsExecuting(false);
        }
    };

    const activeQuestion = useMemo(() => questions[currentQuestion - 1], [questions, currentQuestion]);

    // Mid-Quiz Expiry Check
    useEffect(() => {
        if (!testActive || showResults || !quizSettings?.validUntil) return;

        const interval = setInterval(async () => {
            const now = await getServerTime();
            const validUntil = new Date(quizSettings.validUntil);
            if (now > validUntil) {
                clearInterval(interval);
                alert("Time is up. This test has ended and will be auto-submitted.");
                calculateAndShowResults();
            }
        }, 15000); // Check every 15 seconds

        return () => clearInterval(interval);
    }, [testActive, showResults, quizSettings, calculateAndShowResults]);

    const handleStartExam = async () => {
        await enterFullScreen();
        setTestActive(true);
        
        if (user && id && id !== 'combined') {
            try {
                let activeAttemptId = attemptId || localStorage.getItem(`attempt_id_${user.id}_${id}`);
                if (!activeAttemptId) {
                    console.log("Initializing secure exam attempt on server...");
                    const response = await api.post('/attempts/start', {
                        quizId: id,
                        studentId: user.id
                    });
                    if (response?.attemptId) {
                        activeAttemptId = response.attemptId;
                        setAttemptId(activeAttemptId);
                        localStorage.setItem(`attempt_id_${user.id}_${id}`, activeAttemptId);
                    }
                } else {
                    setAttemptId(activeAttemptId);
                    console.log(`Re-attaching to existing attempt ${activeAttemptId}...`);
                }
            } catch (err) {
                console.error("Failed to initialize secure exam session:", err);
            }
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;

    if (showResults) {
        const showScore = quizSettings?.showPercentage !== false; // Default true
        const showAnswers = quizSettings?.showAnswers !== false;   // Default true

        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
                {/* Background Decorative Elements */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px] animate-pulse" />

                <div className="glass-card p-8 md:p-12 max-w-4xl w-full text-center relative z-10 border-white/10 shadow-2xl">
                    <div className="mb-8 relative inline-block">
                        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                        <div className="relative bg-primary text-white p-4 rounded-full shadow-lg shadow-primary/50 flex items-center justify-center animate-in zoom-in duration-500">
                            <CheckCircle2 className="w-12 h-12" />
                        </div>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                        <span className="text-gradient">Excellent Work!</span>
                    </h1>

                    {!showScore && !showAnswers ? (
                        <p className="text-xl text-text font-medium mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            Test completed successfully!
                        </p>
                    ) : (
                        <p className="text-muted mb-8 text-lg font-medium">Your assessment has been recorded.</p>
                    )}

                    {showScore && (
                        <div className="mb-12 py-10 bg-surface/50 rounded-2xl border border-white/5 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-both">
                            <div className="text-7xl font-black text-primary mb-2 drop-shadow-sm">
                                {Math.round((score / questions.length) * 100)}%
                            </div>
                            <p className="text-xs font-bold text-muted uppercase tracking-widest">Total Score Percentage</p>
                            <p className="text-sm font-medium text-text mt-4">You scored {score} out of {questions.length}</p>
                        </div>
                    )}

                    {/* Detailed Question Review */}
                    {showAnswers ? (
                        <div className="text-left mb-12 space-y-6 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                            {questions.map((q, index) => {
                                const userAnswer = answers[q.id];

                                // Determine correctness
                                let isCorrect = false;
                                if (q.type === 'msq') {
                                    const correctArr = Array.isArray(q.correct) ? q.correct : [];
                                    const userArr = Array.isArray(userAnswer) ? userAnswer : [];
                                    if (userArr.length === correctArr.length &&
                                        userArr.every((val: any) => correctArr.includes(val))) {
                                        isCorrect = true;
                                    }
                                } else if (q.type === 'range') {
                                    const userVal = Number(userAnswer);
                                    if (!isNaN(userVal) && q.correct && userVal >= q.correct.min && userVal <= q.correct.max) {
                                        isCorrect = true;
                                    }
                                } else if (q.type === 'code') {
                                    isCorrect = codeExecutionStatus[q.id] || false;
                                } else {
                                    if (userAnswer === q.correct) isCorrect = true;
                                }

                                // Format Helper
                                const formatAns = (ans: any, type: string) => {
                                    if (ans === undefined || ans === null || ans === '') return <span className="text-muted italic">Skipped</span>;
                                    if (type === 'mcq' || type === 'true_false') {
                                        if (q.options && q.options[ans]) return <MathText text={q.options[ans].text || q.options[ans]} />;
                                        return `Option ${Number(ans) + 1}`;
                                    }
                                    if (type === 'msq' && Array.isArray(ans)) {
                                        return ans.map((a: any, i: number) => <span key={i}>{i > 0 && ', '}<MathText text={q.options[a]?.text || q.options[a] || `Option ${Number(a) + 1}`} /></span>);
                                    }
                                    if (type === 'code') return <span className="font-mono text-xs">Code Solution</span>;
                                    return ans;
                                };

                                return (
                                    <div key={q.id} className={cn(
                                        "p-6 rounded-2xl border transition-all duration-300",
                                        isCorrect
                                            ? "border-green-500/20 bg-green-500/5"
                                            : "border-red-500/20 bg-red-500/5 shadow-inner"
                                    )}>
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-xs font-bold uppercase tracking-widest text-muted">Question {index + 1}</span>
                                            <div className={cn(
                                                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                                                isCorrect ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                                            )}>
                                                {isCorrect ? "Mastered" : "Revision Needed"}
                                            </div>
                                        </div>
                                        <MathText text={q.question} className="text-sm text-text font-semibold mb-6 leading-relaxed" as="p" />

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-surface/30 p-4 rounded-xl border border-white/5">
                                            <div>
                                                <span className="text-[10px] font-bold text-muted uppercase block mb-1">Your Submission</span>
                                                <div className="text-sm font-medium text-text">{formatAns(userAnswer, q.type)}</div>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-bold text-muted uppercase block mb-1">Correct Key</span>
                                                <div className="text-sm font-medium text-primary">{formatAns(q.correct, q.type)}</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        null
                    )}

                    <div className="flex flex-col items-center gap-4">
                        {/* Violations Recorded text removed */}
                        <button
                            onClick={() => navigate('/student/dashboard')}
                            className="btn-primary w-full py-4 text-lg rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] transition-all"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (questions.length === 0) return (
        <div className="h-screen flex flex-col items-center justify-center bg-background">
            <h2 className="text-xl font-bold text-text">No questions found.</h2>
            <button onClick={() => navigate(-1)} className="mt-4 text-primary font-medium hover:underline">Go Back</button>
        </div>
    );

    return (
        <div
            className="min-h-screen bg-background text-text font-sans selection:bg-transparent select-none relative on-copy-disable"
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                WebkitTouchCallout: 'none',
            }}
        >
            {/* Watermark removed by user request (Visual Noise) */}

            {/* --- BLUR PROTECTION OVERLAY --- */}
            {!isSubmitting && !isWindowFocused && testActive && !showResults && !isOffline && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-2xl flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-75">
                    <ShieldAlert className="w-24 h-24 text-red-500 mb-6 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                    <h2 className="text-4xl font-extrabold text-white mb-4 tracking-tight">Exam Terminated</h2>
                    <p className="text-xl text-white/80 max-w-xl leading-relaxed">
                        Security Violation Detected (Focus Lost).
                        <br />Your exam is being submitted...
                    </p>
                </div>
            )}

            {/* --- OFFLINE PROTECTION OVERLAY --- */}
            {!isSubmitting && isOffline && testActive && !showResults && (
                <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
                    <WifiOff className="w-24 h-24 text-yellow-500 mb-6 animate-pulse" />
                    <h2 className="text-4xl font-extrabold text-white mb-4 tracking-tight">Connection Lost</h2>
                    <p className="text-xl text-white/80 max-w-xl leading-relaxed">
                        Please check your internet connection.
                        <br />Your progress is saved locally. The exam will resume once reconnected.
                    </p>
                </div>
            )}

            {/* --- SUBMITTING OVERLAY --- */}
            {isSubmitting && (
                <div className="fixed inset-0 z-[120] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
                    <Loader2 className="w-16 h-16 text-primary animate-spin mb-6" />
                    <h2 className="text-3xl font-bold text-text mb-4 tracking-tight">Submitting Exam...</h2>
                    <p className="text-xl text-muted max-w-xl leading-relaxed">
                        Please wait while your answers are securely evaluated.
                    </p>
                </div>
            )}

            {/* --- WARNING OVERLAY --- */}
            {warning && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] animate-in slide-in-from-top-4 fade-in duration-300 w-full max-w-lg px-4">
                    <div className="bg-red-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 border-2 border-red-400">
                        <div className="p-2 bg-white/20 rounded-full shrink-0 animate-pulse">
                            <AlertTriangle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg leading-tight">Violation Detected</h3>
                            <p className="text-white/90 text-sm mt-1">{warning}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* --- HEADER --- */}
            <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-700 px-6 py-3 flex items-center justify-between transition-all">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 cursor-pointer group" onClick={() => navigate(`/ student / practice / ${id} `)}>
                        <img src={theme === 'dark' ? "/logo-dark.png" : "/logo-light.png"} alt="Logo" className="h-8 w-auto object-contain rounded-lg group-hover:scale-105 transition-transform" />
                    </div>
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center w-full max-w-md hidden md:flex gap-3">
                    <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex-1">
                        <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${(currentQuestion / questions.length) * 100}% ` }} />
                    </div>
                    <span className="text-xs font-bold text-primary tabular-nums">
                        {Math.round((currentQuestion / questions.length) * 100)}%
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    <QuizTimer initialSeconds={(quizSettings?.duration || 20) * 60} onTimeUp={calculateAndShowResults} />
                    <button
                        onClick={() => setShowCalculator(!showCalculator)}
                        className={cn(
                            "p-2 rounded-full transition-colors",
                            showCalculator ? "bg-primary text-white" : "hover:bg-surface text-neutral-600 dark:text-neutral-400"
                        )}
                        title="Calculator"
                    >
                        <CalculatorIcon className="w-5 h-5" />
                    </button>
                    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-surface transition-colors">
                        {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-neutral-600" />}
                    </button>
                </div>
            </header>

            {/* --- ANTI-CHEAT & PAUSE OVERLAYS (Keep Existing Logic) --- */}
            {!isSubmitting && (!testActive || !isFullScreen) && (
                <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in">
                    <div className="bg-surface border border-red-500/30 shadow-2xl rounded-2xl p-8 max-w-lg text-center">
                        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-6" />
                        <h2 className="text-2xl font-bold mb-3 text-text">Exam Security Protocol</h2>
                        <p className="text-muted leading-relaxed mb-8">
                            This exam is monitored. Full screen mode is mandatory.
                            Switching tabs or exiting full screen will result in strict penalties.
                        </p>
                        <button
                            onClick={handleStartExam}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-10 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-red-600/30"
                        >
                            {!testActive ? "I Understand, Start Exam" : "Resume Full Screen"}
                        </button>
                    </div>
                </div>
            )}
            {isPaused && (
                <div className="fixed inset-0 z-[80] bg-background/90 backdrop-blur flex flex-col items-center justify-center p-4">
                    <AlertTriangle className="w-20 h-20 text-yellow-500 mb-6 animate-pulse" />
                    <h2 className="text-3xl font-bold text-text">Exam Paused</h2>
                    <p className="text-xl text-muted mt-2">The proctor has paused this session.</p>
                </div>
            )}


            {/* --- MAIN LAYOUT --- */}
            <main className="max-w-7xl mx-auto p-3 md:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 min-h-[calc(100dvh-80px)]">

                {/* --- LEFT: QUESTION --- */}
                <div className="lg:col-span-8 flex flex-col gap-4">
                    <div className="bg-surface border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 md:p-6 shadow-sm flex flex-col gap-4 min-h-[350px]">

                        {/* Question Meta */}
                        <div className="flex justify-between items-center text-sm">
                            <span className="font-medium text-muted bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-full text-xs">
                                Question {currentQuestion} / {questions.length}
                            </span>
                            <span className="text-muted font-mono text-[10px] uppercase tracking-wider">
                                {activeQuestion.type === 'msq' ? 'Multi-Select' : activeQuestion.type === 'range' ? 'Numeric Range' : 'Single Choice'}
                            </span>
                        </div>

                        {/* Question Text */}
                        <div className="prose dark:prose-invert max-w-none select-none pointer-events-none">
                                <MathText text={activeQuestion.question} className="text-lg md:text-xl font-semibold leading-relaxed text-text" as="h2" />
                        </div>

                        {/* Optional Image */}
                        {activeQuestion.imageUrl && activeQuestion.imageUrl.length > 5 && (
                            <div className="relative group w-fit rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-black/20 select-none">
                                {/* pointer-events-none prevents Right Click and Long Press (Google Lens) */}
                                <img
                                    src={activeQuestion.imageUrl}
                                    alt="Question Asset"
                                    className="max-h-[300px] w-auto object-contain transition-transform duration-300 group-hover:scale-[1.02] pointer-events-none"
                                    onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                                    onContextMenu={(e) => e.preventDefault()}
                                    draggable="false"
                                />
                                {/* Overlay to still allow clicking for Zoom, but blocks direct image interaction */}
                                <div
                                    className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center cursor-zoom-in"
                                    onClick={() => setZoomedImage(activeQuestion.imageUrl)}
                                    onContextMenu={(e) => e.preventDefault()}
                                >
                                    <ZoomIn className="text-white w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                                </div>
                            </div>
                        )}

                        {/* Options / Input */}
                        <div className="mt-2 flex flex-col gap-2">
                            {activeQuestion.type === 'range' ? (
                                <div className="max-w-xs">
                                    <label className="text-sm font-medium text-muted mb-1 block">Enter the number</label>
                                    <input
                                        type="number"
                                        placeholder="Type answer here..."
                                        className="w-full bg-background border-2 border-neutral-200 dark:border-neutral-700 rounded-lg p-3 text-lg font-mono focus:border-primary focus:outline-none transition-all shadow-sm"
                                        value={String(answers[currentQuestion] ?? '')}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setAnswers(prev => {
                                                const next = { ...prev, [currentQuestion]: val };
                                                saveProgress(next);
                                                return next;
                                            });
                                        }}
                                    />
                                    <p className="text-[10px] text-muted mt-1 ml-1">Value must be between Min and Max specified.</p>
                                </div>
                            ) : (
                                activeQuestion.options.map((opt: any, idx: number) => {
                                    const isSelected = activeQuestion.type === 'msq'
                                        ? (answers[currentQuestion] as number[])?.includes(idx)
                                        : answers[currentQuestion] === idx;

                                    const optText = typeof opt === 'object' ? opt.text : opt;
                                    const optImg = typeof opt === 'object' ? opt.image : null;

                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => handleOptionSelect(idx)}
                                            className={cn(
                                                "group relative p-3 rounded-lg border cursor-pointer transition-all duration-200 flex items-center gap-3",
                                                isSelected
                                                    ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
                                                    : "border-neutral-200 dark:border-neutral-700 bg-surface hover:border-primary/50 hover:bg-neutral-50 dark:hover:bg-white/5"
                                            )}
                                        >
                                            {/* Checkbox/Radio Indicator */}
                                            <div className={cn(
                                                "w-5 h-5 rounded-full border flex items-center justify-center transition-colors flex-shrink-0",
                                                activeQuestion.type === 'msq' ? "rounded-md" : "rounded-full",
                                                isSelected ? "bg-primary border-primary" : "border-neutral-300 dark:border-neutral-300 dark:border-neutral-600 group-hover:border-primary/60"
                                            )}>
                                                {isSelected && activeQuestion.type === 'msq' && (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                                )}
                                                {isSelected && activeQuestion.type !== 'msq' && (
                                                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                                                )}
                                            </div>

                                            {/* Option Content */}
                                            <div className="flex-1">
                                                <MathText text={optText} className="text-sm font-medium text-text selection:bg-transparent" />
                                                {optImg && (
                                                    <img
                                                        src={optImg}
                                                        className="mt-2 h-16 rounded-md border border-neutral-200 dark:border-neutral-700 pointer-events-none"
                                                        onContextMenu={(e) => e.preventDefault()}
                                                        draggable="false"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            )}

                            {activeQuestion.type === 'code' && (
                                <div className="space-y-4">
                                    <div className="relative">
                                        <div className="absolute top-2 right-2 z-10 flex gap-2">
                                            <button
                                                onClick={() => {
                                                    const val = activeQuestion.correct.starterCode || '';
                                                    setAnswers(prev => {
                                                        const next = { ...prev, [currentQuestion]: val };
                                                        saveProgress(next);
                                                        return next;
                                                    });
                                                }}
                                                className="p-1.5 bg-neutral-200 dark:bg-neutral-700 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                                                title="Reset Code"
                                            >
                                                <RotateCcw className="w-4 h-4 text-text" />
                                            </button>
                                        </div>
                                        <textarea
                                            value={(answers[currentQuestion] as string) ?? activeQuestion.correct.starterCode ?? ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setAnswers(prev => {
                                                    const next = { ...prev, [currentQuestion]: val };
                                                    saveProgress(next);
                                                    return next;
                                                });
                                            }}
                                            className="w-full h-64 bg-[#1e1e1e] text-neutral-200 font-mono text-sm p-4 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                            spellCheck="false"
                                            placeholder="// Write your code here..."
                                        />
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted font-mono bg-surface px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700">
                                                {activeQuestion.correct?.allowedLanguages && activeQuestion.correct.allowedLanguages.length > 0 ? (
                                                    <select
                                                        className="bg-transparent border-none outline-none text-xs font-mono cursor-pointer"
                                                        value={selectedLanguages[activeQuestion.id] || activeQuestion.correct.language || 'python'}
                                                        onChange={(e) => setSelectedLanguages(prev => ({ ...prev, [activeQuestion.id]: e.target.value }))}
                                                    >
                                                        {/* Ensure default is always an option just in case */}
                                                        <option value={activeQuestion.correct.language || 'python'}>{activeQuestion.correct.language || 'python'}</option>
                                                        {activeQuestion.correct.allowedLanguages.map((lang: string) => (
                                                            lang !== (activeQuestion.correct.language || 'python') && <option key={lang} value={lang}>{lang}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    activeQuestion.correct?.language || 'python'
                                                )}
                                            </span>
                                        </div>
                                        <button
                                            onClick={handleRunCode}
                                            disabled={isExecuting}
                                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
                                        >
                                            {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                            Run Code
                                        </button>
                                    </div>

                                    {(executionOutput[activeQuestion.id] || codeExecutionStatus[activeQuestion.id] !== undefined) && (
                                        <div className="bg-neutral-900 rounded-lg p-4 font-mono text-xs overflow-auto max-h-48 border border-neutral-800">
                                            <div className="flex items-center gap-2 mb-2 border-b border-neutral-800 pb-2">
                                                <Code2 className="w-3 h-3 text-muted" />
                                                <span className="text-muted">Output</span>
                                                {codeExecutionStatus[activeQuestion.id] ? (
                                                    <span className="ml-auto text-green-500 font-bold flex items-center gap-1">
                                                        <CheckCircle2 className="w-3 h-3" /> Passed
                                                    </span>
                                                ) : codeExecutionStatus[activeQuestion.id] === false ? (
                                                    <span className="ml-auto text-red-500 font-bold flex items-center gap-1">
                                                        <X className="w-3 h-3" /> Failed
                                                    </span>
                                                ) : null}
                                            </div>
                                            {executionOutput[activeQuestion.id]?.stderr && (
                                                <div className="text-red-400 mb-2 whitespace-pre-wrap">{executionOutput[activeQuestion.id].stderr}</div>
                                            )}
                                            <div className="text-neutral-300 whitespace-pre-wrap">
                                                {executionOutput[activeQuestion.id]?.stdout || 'No output'}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Navigation Bar (Desktop) */}
                    <div className="bg-surface border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 flex justify-between items-center shadow-sm sticky bottom-4">
                        <button
                            onClick={() => setCurrentQuestion(prev => Math.max(1, prev - 1))}
                            disabled={currentQuestion === 1}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm text-text hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" /> Previous
                        </button>

                        <button
                            onClick={() => {
                                if (currentQuestion === questions.length) calculateAndShowResults();
                                else setCurrentQuestion(prev => Math.min(questions.length, prev + 1));
                            }}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm text-white transition-all shadow-md",
                                currentQuestion === questions.length
                                    ? "bg-black dark:bg-white dark:text-black hover:scale-105"
                                    : "bg-primary hover:bg-primary-dark hover:scale-105 shadow-primary/25"
                            )}
                        >
                            {currentQuestion === questions.length ? 'Finish Exam' : 'Next Question'}
                            {currentQuestion !== questions.length && <ChevronRight className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* --- RIGHT: GRID --- */}
                <div className="lg:col-span-4 space-y-4">
                    <div className="bg-surface border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 shadow-sm sticky top-20 w-fit mx-auto">


                        <div className="grid grid-cols-5 gap-2 place-items-center w-fit mx-auto">
                            {questions.map((q) => {
                                const isSaved = answers[q.id] !== undefined && answers[q.id] !== '';
                                const isActive = currentQuestion === q.id;
                                return (
                                    <button
                                        key={q.id}
                                        onClick={() => setCurrentQuestion(q.id)}
                                        className={cn(
                                            "w-11 h-11 rounded-lg text-xs font-bold transition-all duration-200 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center", // Added border-neutral-700
                                            isActive
                                                ? "border-primary text-primary bg-primary/10"
                                                : isSaved
                                                    ? "bg-primary/20 border-transparent text-primary dark:text-primary-foreground"
                                                    : "bg-neutral-100 dark:bg-white/5 border-neutral-200 dark:border-neutral-700 text-muted hover:bg-neutral-200 dark:hover:bg-white/10" // Ensure border stays grey if not saved/active
                                        )}
                                    >
                                        {q.id}
                                    </button>
                                )
                            })}
                        </div>

                        <div className="mt-6 space-y-3 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                            <div className="flex items-center gap-3 text-xs text-muted">
                                <div className="w-3 h-3 rounded bg-primary/20" /> Answered
                                <div className="w-3 h-3 rounded border-2 border-primary bg-primary/10" /> Current
                                <div className="w-3 h-3 rounded bg-neutral-100 dark:bg-white/5" /> Unanswered
                            </div>
                        </div>
                    </div>
                </div>

            </main>

            {/* Image Zoom Overlay */}
            {zoomedImage && (
                <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-200 cursor-zoom-out" onClick={() => setZoomedImage(null)}>
                    <X className="absolute top-6 right-6 w-10 h-10 text-white/70 hover:text-white transition-colors" />
                    <img src={zoomedImage} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
                </div>
            )}

            {/* Calculator Overlay */}
            {showCalculator && <Calculator onClose={() => setShowCalculator(false)} />}
        </div>
    );
};

export default MCQTest;
