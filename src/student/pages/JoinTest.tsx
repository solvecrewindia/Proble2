import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '../../shared/components/Button';
import { Key, Clock, FileText, AlertCircle, Play, QrCode, X, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { Card } from '../../shared/components/Card';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../../shared/context/AuthContext';

const JoinTest = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user, getServerTime, isLoading: isAuthLoading } = useAuth();
    const urlCode = searchParams.get('code');

    const [code, setCode] = useState(urlCode || '');

    const [verifying, setVerifying] = useState(!!urlCode);
    const [quiz, setQuiz] = useState<any>(null);
    const [error, setError] = useState('');
    const [alreadyCompleted, setAlreadyCompleted] = useState(false);
    const [isExpired, setIsExpired] = useState(false);
    const [isNotStartedYet, setIsNotStartedYet] = useState<Date | null>(null);

    const [scanning, setScanning] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        if (scanning) {
            const timer = setTimeout(() => {
                if (!scannerRef.current) {
                    const html5QrCode = new Html5Qrcode("reader");
                    scannerRef.current = html5QrCode;

                    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

                    html5QrCode.start(
                        { facingMode: "environment" },
                        config,
                        onScanSuccess,
                        onScanFailure
                    ).catch(err => {
                        console.error("Error starting scanner", err);
                        html5QrCode.start(
                            { facingMode: "user" },
                            config,
                            onScanSuccess,
                            onScanFailure
                        ).catch(e => console.error("Failed to start scanner completely", e));
                    });
                }
            }, 100);

            return () => {
                clearTimeout(timer);
                if (scannerRef.current) {
                    if (scannerRef.current.isScanning) {
                        scannerRef.current.stop().then(() => {
                            scannerRef.current?.clear();
                            scannerRef.current = null;
                        }).catch(err => console.error("Failed to stop scanner", err));
                    } else {
                        scannerRef.current.clear();
                        scannerRef.current = null;
                    }
                }
            };
        }
    }, [scanning]);

    const hasAutoVerified = useRef(false);

    useEffect(() => {
        if (urlCode && user && !hasAutoVerified.current) {
            hasAutoVerified.current = true;
            handleVerifyCode(urlCode);
        }
    }, [urlCode, user]);

    // Auto-refresh when waiting for a scheduled test
    useEffect(() => {
        if (!isNotStartedYet || !code) return;

        console.log("Starting auto-refresh timer for scheduled test...");
        const interval = setInterval(async () => {
            const serverTime = await getServerTime();
            if (serverTime >= isNotStartedYet) {
                console.log("Scheduled time reached! Refreshing...");
                clearInterval(interval);
                setIsNotStartedYet(null);
                handleVerifyCode(code);
            }
        }, 5000); // Check every 5 seconds

        return () => clearInterval(interval);
    }, [isNotStartedYet, code, getServerTime]);

    const extractCode = (text: string) => {
        try {
            if (text.includes('://') || text.includes('vercel.app')) {
                const parts = text.split('/');
                const lastPart = parts[parts.length - 1];
                const code = lastPart || parts[parts.length - 2];
                return (code || '').toUpperCase();
            }
            return text.toUpperCase();
        } catch (e) {
            return text.toUpperCase();
        }
    };

    const onScanSuccess = (decodedText: string, decodedResult: any) => {
        console.log(`Scan result: ${decodedText}`, decodedResult);
        const extracted = extractCode(decodedText);
        setScanning(false);
        setCode(extracted);
        handleVerifyCode(extracted);
    };

    const onScanFailure = () => {
        // console.warn(`Code scan error = ${error}`);
    };

    const handleVerifyCode = async (codeToVerify: string) => {
        setVerifying(true);
        setError('');

        try {
            if (!user) throw new Error("Please login to continue");

            let quizData = null;
            try {
                quizData = await api.get(`/quizzes?code=${codeToVerify}`);
            } catch (err) {
                console.error("Failed to query quiz code via secure API:", err);
            }
            if (!quizData) throw new Error('Quiz not found');

            const { count } = await supabase
                .from('questions')
                .select('*', { count: 'exact', head: true })
                .eq('quiz_id', quizData.id);

            quizData.question_count = count || 0;

            // --- SERVER-SIDE ATTEMPT CHECK (Enforced by Supabase, not localStorage) ---
            // This check queries the DB directly, so incognito mode / cleared
            // browser data cannot bypass it. The unique constraint on
            // quiz_results(student_id, quiz_id) is the ultimate safety net.
            // --- SERVER-SIDE ATTEMPT CHECK (Enforced by Supabase, not localStorage) ---
            // Broaden check: Any quiz with a scheduled start time or of type 'master' 
            // is typically meant to be taken once. 
            const shouldCheckAttempts = quizData.type === 'master' || quizData.settings?.scheduledAt;
            
            if (shouldCheckAttempts) {
                const { data: existingAttempts, error: attemptError } = await supabase
                    .from('quiz_results')
                    .select('id')
                    .eq('quiz_id', quizData.id)
                    .eq('student_id', user.id)
                    .limit(1);
                if (attemptError) {
                    console.error("Error checking attempts:", attemptError);
                } else if (existingAttempts && existingAttempts.length > 0) {
                    setAlreadyCompleted(true);
                    setVerifying(false);
                    return;
                }
            }

            // Validity Constraint Check
            if (quizData.settings?.validUntil) {
                const validityDate = new Date(quizData.settings.validUntil);
                if (new Date() > validityDate) {
                    setIsExpired(true);
                    setVerifying(false);
                    return;
                }
            }

            // Add Start Time Constraint Check
            if (quizData.settings?.scheduledAt) {
                const startDate = new Date(quizData.settings.scheduledAt);
                const serverTime = await getServerTime();
                
                // STRICT TIMING: No buffer. Use server time as the absolute source.
                if (serverTime.getTime() < startDate.getTime()) {
                    setIsNotStartedYet(startDate);
                    setVerifying(false);
                    return;
                }
            }

            if (quizData.settings?.allowedDomain) {
                const userEmail = user.email || '';
                if (!userEmail.endsWith(quizData.settings.allowedDomain)) {
                    throw new Error(`This quiz is restricted to users from ${quizData.settings.allowedDomain} only.`);
                }
            }

            setQuiz(quizData);
        } catch (err: any) {
            console.error('Error fetching quiz:', err);
            
            // --- AUTO-SESSION REFRESH ON JWT EXPIRE ---
            const isAuthError = err.message?.toLowerCase().includes('jwt') || err.message?.toLowerCase().includes('unauthorized');
            
            if (isAuthError) {
                console.warn("JoinTest: Detected expired session. Attempting background refresh...");
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        console.log("JoinTest: Session refreshed. Retrying verification...");
                        // Delay slightly to ensure client state synchronizes
                        setTimeout(() => handleVerifyCode(codeToVerify), 500);
                        return;
                    }
                } catch (refreshErr) {
                    console.error("JoinTest: Failed to refresh session automatically", refreshErr);
                }
            }

            setError(err.message || 'Invalid access code. Please check and try again.');
            setQuiz(null);
        } finally {
            setVerifying(false);
        }
    };

    const handleManualJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (code) handleVerifyCode(code);
    };

    const handleStartTest = () => {
        if (quiz) {
            if (quiz.type === 'live') {
                navigate(`/student/live/${quiz.id}`);
            } else {
                navigate(`/student/test/${quiz.id}`);
            }
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const pastedText = e.clipboardData.getData('text');
        if (pastedText) {
            const extracted = extractCode(pastedText);
            setTimeout(() => {
                setCode(extracted);
                if (error) setError('');
            }, 0);
        }
    };

    if (alreadyCompleted) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
                {/* Background glow */}
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-red-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-red-500/5 rounded-full blur-[120px]" />

                <div className="relative z-10 max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                    {/* Icon */}
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full animate-pulse" />
                        <div className="relative w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border-2 border-red-500/30">
                            <ShieldAlert className="w-12 h-12 text-red-500" />
                        </div>
                    </div>

                    {/* Message */}
                    <div className="space-y-3">
                        <h1 className="text-3xl font-black text-text tracking-tight">
                            Test Already Completed
                        </h1>
                        <p className="text-muted text-base leading-relaxed px-4">
                            You have already completed this test.<br />
                            If you accidentally exited or something went wrong, please contact your respective faculty.
                        </p>
                    </div>

                    {/* Action */}
                    <Button
                        className="w-full max-w-xs mx-auto h-14 text-lg font-bold rounded-2xl"
                        onClick={() => navigate('/student/dashboard')}
                    >
                        Go to Dashboard
                    </Button>
                </div>
            </div>
        );
    }

    if (isExpired) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-neutral-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-neutral-500/5 rounded-full blur-[120px]" />

                <div className="relative z-10 max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-neutral-500/20 blur-3xl rounded-full animate-pulse" />
                        <div className="relative w-24 h-24 bg-neutral-500/10 rounded-full flex items-center justify-center mx-auto border-2 border-neutral-500/30">
                            <Clock className="w-12 h-12 text-neutral-500" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h1 className="text-3xl font-black text-text tracking-tight">
                            This Test Has Ended
                        </h1>
                        <p className="text-muted text-base leading-relaxed px-4">
                            The assessment you are trying to access is no longer available.
                        </p>
                    </div>

                    <Button
                        className="w-full max-w-xs mx-auto h-14 text-lg font-bold rounded-2xl bg-neutral-500 hover:bg-neutral-600 text-white"
                        onClick={() => navigate('/student/dashboard')}
                    >
                        Go to Dashboard
                    </Button>
                </div>
            </div>
        );
    }

    if (isNotStartedYet) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-500/5 rounded-full blur-[120px]" />

                <div className="relative z-10 max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse" />
                        <div className="relative w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto border-2 border-blue-500/30">
                            <Clock className="w-12 h-12 text-blue-500" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h1 className="text-3xl font-black text-text tracking-tight">
                            Test Not Started Yet
                        </h1>
                        <p className="text-muted text-base leading-relaxed px-4">
                            This test has not started yet. Please wait until{' '}
                            <span className="font-bold text-text">
                                {isNotStartedYet.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (verifying || (urlCode && !user && isAuthLoading)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                <p className="text-muted">Verifying access code...</p>
            </div>
        );
    }

    if (quiz) {
        return (
            <div className="max-w-2xl mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="p-8 border-neutral-300 dark:border-neutral-600 bg-surface">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary mb-4">
                            <FileText className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-bold text-text mb-2">{quiz.title}</h1>
                        <p className="text-muted text-lg">{quiz.description || 'No description provided.'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        {quiz.type !== 'live' && (
                            <div className="p-4 rounded-xl bg-background border border-neutral-300 dark:border-neutral-600 flex items-center justify-center flex-col gap-2">
                                <Clock className="w-6 h-6 text-primary" />
                                <span className="font-medium text-text">{quiz.settings?.duration || 60} mins</span>
                                <span className="text-xs text-muted">Duration</span>
                            </div>
                        )}
                        <div className={`p-4 rounded-xl bg-background border border-neutral-300 dark:border-neutral-600 flex items-center justify-center flex-col gap-2 ${quiz.type === 'live' ? 'col-span-2' : ''}`}>
                            <AlertCircle className="w-6 h-6 text-primary" />
                            <span className="font-medium text-text">{quiz.question_count !== undefined ? quiz.question_count : 'N/A'}</span>
                            <span className="text-xs text-muted">Questions</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Button
                            className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
                            onClick={handleStartTest}
                        >
                            <Play className="w-5 h-5 mr-2" /> Start Test
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full"
                            onClick={() => {
                                setQuiz(null);
                                setCode('');
                                navigate('/student/join');
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background relative overflow-hidden selection:bg-primary/20">
            {/* Premium Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-primary/5 rounded-full blur-[100px]" />

            <div className="max-w-md mx-auto pt-24 pb-12 px-4 relative z-10">
                {/* Scanner Overlay - Full Screen Custom UI */}
                {scanning && (
                    <div className="fixed inset-0 z-50 bg-black flex flex-col">
                        {/* Close Button */}
                        <button
                            onClick={() => setScanning(false)}
                            className="absolute top-6 right-6 p-3 bg-black/40 text-white rounded-full hover:bg-black/60 transition-all z-[60] backdrop-blur-md border border-white/10"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        {/* Camera Viewport */}
                        <div className="relative w-full h-full flex items-center justify-center bg-black">
                            <div id="reader" className="w-full h-full" style={{ objectFit: 'cover' }}></div>

                            {/* Custom Scanning Frame Overlay */}
                            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-50 p-6">
                                <div className="w-full max-w-sm aspect-square relative">
                                    <div className="absolute top-0 left-0 w-12 h-12 border-l-4 border-t-4 border-primary rounded-tl-2xl"></div>
                                    <div className="absolute top-0 right-0 w-12 h-12 border-r-4 border-t-4 border-primary rounded-tr-2xl"></div>
                                    <div className="absolute bottom-0 left-0 w-12 h-12 border-l-4 border-b-4 border-primary rounded-bl-2xl"></div>
                                    <div className="absolute bottom-0 right-0 w-12 h-12 border-r-4 border-b-4 border-primary rounded-br-2xl"></div>

                                    {/* Scanning Line Animation */}
                                    <div className="absolute top-0 left-0 w-full h-1 bg-primary shadow-[0_0_15px_rgba(0,199,230,0.8)] animate-[scan_2s_infinite_ease-in-out]"></div>
                                </div>

                                <div className="mt-12 text-center">
                                    <p className="text-white font-bold text-lg bg-black/40 px-8 py-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-xl">
                                        Align Quiz QR Code
                                    </p>
                                    <p className="text-white/60 text-sm mt-4">Position the code within the frame to join</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="glass-card p-10 rounded-[2.5rem] border-white/10 shadow-2xl text-center space-y-10 animate-in zoom-in-95 fade-in duration-500">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                        <div className="relative w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto text-primary border border-primary/20 rotate-3 hover:rotate-0 transition-transform duration-500">
                            <Key className="w-10 h-10" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h1 className="text-4xl font-black text-text tracking-tight">Join Quiz</h1>
                        <p className="text-muted font-medium leading-relaxed">
                            Ready to test your knowledge? <br />
                            Scan or enter your code below.
                        </p>
                    </div>

                    <div className="space-y-6">
                        <Button
                            type="button"
                            onClick={() => setScanning(true)}
                            className="w-full h-16 text-xl font-bold bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-text border border-neutral-200 dark:border-white/10 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] group"
                        >
                            <QrCode className="w-6 h-6 mr-3 group-hover:scale-110 transition-transform text-primary" />
                            Scan QR Code
                        </Button>

                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-neutral-200 dark:border-white/5" />
                            </div>
                            <div className="relative flex justify-center text-[10px] uppercase font-black tracking-[0.2em]">
                                <span className="bg-background px-4 text-muted/60">Secure Entry</span>
                            </div>
                        </div>

                        <form onSubmit={handleManualJoin} className="space-y-6">
                            <div className="relative group">
                                <input
                                    type="text"
                                    placeholder="ACCESS CODE"
                                    value={code}
                                    onPaste={handlePaste}
                                    onChange={(e) => {
                                        setCode(e.target.value.toUpperCase());
                                        if (error) setError('');
                                    }}
                                    className="w-full h-20 text-center text-3xl font-black tracking-[0.15em] uppercase rounded-2xl border border-neutral-200 dark:border-white/5 bg-neutral-100 dark:bg-white/5 text-text focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted/30 placeholder:tracking-normal placeholder:font-bold placeholder:text-lg"
                                    maxLength={30}
                                />
                            </div>

                            {error && (
                                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-bold flex flex-col items-center justify-center gap-3 animate-in slide-in-from-top-2">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                    {error.includes('already completed') && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full border-red-500/50 text-red-500 hover:bg-red-500/20"
                                            onClick={() => navigate('/student/dashboard')}
                                        >
                                            Return to Dashboard
                                        </Button>
                                    )}
                                </div>
                            )}

                            {!error.includes('restricted to users from') && !error.includes('already completed') && (
                                <Button
                                    type="submit"
                                    className="w-full h-16 text-xl font-black rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1 active:translate-y-0"
                                    disabled={!code}
                                >
                                    Verify & Join
                                </Button>
                            )}
                        </form>
                    </div>
                </div>

                <p className="mt-12 text-center text-muted/40 text-xs font-bold uppercase tracking-[0.3em]">
                    Proble Learning System
                </p>
            </div>
        </div>
    );
};

export default JoinTest;
