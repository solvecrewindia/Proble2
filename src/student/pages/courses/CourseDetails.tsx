import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Star, Clock, BookOpen, ArrowLeft, ArrowRight, Check, Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../lib/api';
import { useAuth } from '../../../shared/context/AuthContext';

const QuizDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [quiz, setQuiz] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const location = useLocation();

    // Rating State
    const [userRating, setUserRating] = useState(0);
    const [averageRating, setAverageRating] = useState(0);
    const [totalRatings, setTotalRatings] = useState(0);

    // Practice State
    const [isAddedToPractice, setIsAddedToPractice] = useState(false);
    const [practiceLoading, setPracticeLoading] = useState(false);
    const [moduleId, setModuleId] = useState<string | null>(null);

    useEffect(() => {
        const fetchQuiz = async () => {
            if (!id) return;
            let quizData = null;
            try {
                quizData = await api.get(`/quizzes/${id}`);
            } catch (err) {
                console.error('Error fetching quiz via secure API:', err);
            }

            if (quizData) {
                const { count } = await supabase
                    .from('questions')
                    .select('*', { count: 'exact', head: true })
                    .eq('quiz_id', id);

                setQuiz({
                    id: quizData.id,
                    title: quizData.title,
                    description: quizData.description,
                    type: quizData.type,
                    duration: (quizData.settings?.duration || 60) + ' mins',
                    questions: count || 0,
                    difficulty: 'Intermediate',
                });

                if (quizData.module_id) {
                    setModuleId(quizData.module_id);
                    checkPracticeStatus(quizData.module_id, quizData.id);
                } else {
                    setModuleId(null);
                    checkPracticeStatus(null, quizData.id);
                }

                if (quizData.type === 'global') {
                    fetchRatings(quizData.id);
                }

                // Auth Check for Master Quizzes
                if (quizData.type === 'master' && !user) {
                    navigate('/login', { state: { from: location }, replace: true });
                    return;
                }

                // Domain Restriction Check
                if (quizData.settings?.allowedDomain && user) {
                    const userEmail = user.email || '';
                    if (!userEmail.endsWith(quizData.settings.allowedDomain)) {
                        alert(`This quiz is restricted to users from ${quizData.settings.allowedDomain} only.`);
                        navigate('/'); // Redirect to home or another page
                        return;
                    }
                }
            }
            setLoading(false);
        };

        const checkPracticeStatus = async (modId: string | null, quizId: string) => {
            if (!user) return;

            let query = supabase.from('user_practice').select('id').eq('user_id', user.id);

            if (modId) {
                query = query.eq('module_id', modId);
            } else {
                query = query.eq('quiz_id', quizId);
            }

            const { data } = await query.single();
            if (data) setIsAddedToPractice(true);
        };

        const fetchRatings = async (quizId: string) => {
            // Fetch Average
            const { data: ratings } = await supabase
                .from('quiz_ratings')
                .select('rating')
                .eq('quiz_id', quizId);

            if (ratings && ratings.length > 0) {
                const avg = ratings.reduce((acc, curr) => acc + curr.rating, 0) / ratings.length;
                setAverageRating(Math.round(avg * 10) / 10);
                setTotalRatings(ratings.length);
            }

            // Fetch User Rating
            if (user) {
                const { data: myRating } = await supabase
                    .from('quiz_ratings')
                    .select('rating')
                    .eq('quiz_id', quizId)
                    .eq('user_id', user.id)
                    .single();
                if (myRating) setUserRating(myRating.rating);
            }
        };

        fetchQuiz();
    }, [id, user]);

    const handleRating = async (rating: number) => {
        if (!user || !quiz) return;

        // Optimistic UI
        setUserRating(rating);

        const { error } = await supabase
            .from('quiz_ratings')
            .upsert({
                user_id: user.id,
                quiz_id: quiz.id,
                rating: rating
            }, { onConflict: 'user_id, quiz_id' });

        if (error) {
            console.error('Error submitting rating:', error);
            // Revert on error? For now just log
        } else {
            // Refetch average to keep it sync
            const { data: ratings } = await supabase
                .from('quiz_ratings')
                .select('rating')
                .eq('quiz_id', quiz.id);
            if (ratings && ratings.length > 0) {
                const avg = ratings.reduce((acc, curr) => acc + curr.rating, 0) / ratings.length;
                setAverageRating(Math.round(avg * 10) / 10);
                setTotalRatings(ratings.length);
            }
        }
    };

    const togglePractice = async () => {
        if (!user) {
            navigate('/login');
            return;
        }
        if (practiceLoading || !quiz) return;

        setPracticeLoading(true);
        try {
            if (isAddedToPractice) {
                let query = supabase.from('user_practice').delete().eq('user_id', user.id);

                if (moduleId) {
                    query = query.eq('module_id', moduleId);
                } else {
                    query = query.eq('quiz_id', quiz.id);
                }

                const { error } = await query;
                if (error) throw error;
                setIsAddedToPractice(false);
            } else {
                const payload: any = { user_id: user.id };
                if (moduleId) {
                    payload.module_id = moduleId;
                } else {
                    payload.quiz_id = quiz.id;
                }

                const { error } = await supabase
                    .from('user_practice')
                    .insert(payload);
                if (error) throw error;
                setIsAddedToPractice(true);
            }
        } catch (err) {
            console.error('Error toggling practice:', err);
        } finally {
            setPracticeLoading(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-background text-text flex items-center justify-center">Loading...</div>;
    if (!quiz) return <div className="min-h-screen bg-background text-text flex items-center justify-center">Quiz not found.</div>;

    return (
        <div className="min-h-screen bg-background text-text font-sans selection:bg-blue-500/30">
            <div className="max-w-6xl mx-auto px-6 pt-8 pb-20">
                {/* Back Button */}
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-muted hover:text-text transition-colors mb-12 group"
                >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    <span className="text-sm font-medium">Back</span>
                </button>

                {/* Header Section */}
                <div className="flex flex-col md:flex-row gap-8 items-start justify-between mb-16 border-b border-neutral-200 dark:border-neutral-800 pb-12">
                    <div className="space-y-6 max-w-2xl">
                        <div className="space-y-2">
                            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-text leading-tight text-balance">
                                {quiz.title}
                            </h1>
                            <p className="text-muted text-lg leading-relaxed">
                                {quiz.description || "No description available for this assessment."}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-muted">
                                <Clock className="w-4 h-4" />
                                <span>{quiz.duration}</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-muted">
                                <BookOpen className="w-4 h-4" />
                                <span>{quiz.questions} Questions</span>
                            </div>
                            {quiz.type === 'global' && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-sm font-medium text-yellow-600 dark:text-yellow-500">
                                    <Star className="w-4 h-4 fill-current" />
                                    <span>{averageRating || 0} ({totalRatings})</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {!moduleId && (
                        <button
                            onClick={togglePractice}
                            disabled={practiceLoading}
                            className={`px-6 py-3 rounded-xl font-bold transition-all active:scale-95 text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-xl shrink-0
                                ${isAddedToPractice
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20'
                                    : 'bg-primary hover:bg-primary/90 text-white shadow-primary/25 hover:shadow-primary/40'
                                }`}
                        >
                            {practiceLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : isAddedToPractice ? (
                                <>
                                    <Check className="w-4 h-4" />
                                    <span>In My Practice</span>
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4" />
                                    <span>Add to My Practice</span>
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Action Cards Grid */}
                <h2 className="text-xl font-bold mb-6 text-text">Choose your mode</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Flashcards Card (Hero - Full Width) */}
                    {quiz.type !== 'master' && (
                        <div
                            onClick={() => navigate(`/student/practice/flashcards/${id}`)}
                            className="group relative md:col-span-2 bg-surface hover:bg-surface-highlight border border-neutral-800 hover:border-indigo-500/50 rounded-3xl p-8 cursor-pointer transition-all duration-500 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-1 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both"
                        >
                            {/* Subtle Glow Effect */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-32 -mt-32 transition-opacity group-hover:opacity-100" />

                            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-8">

                                <div className="flex-1 space-y-2">
                                    <h3 className="text-2xl font-bold text-text group-hover:text-indigo-400 transition-colors">Flashcards Mode</h3>
                                    <p className="text-muted text-base leading-relaxed max-w-2xl">
                                        Master concepts in record time. Swipe through smart flashcards designed for quick recall and active retention.
                                    </p>
                                </div>
                                <div className="mt-4 md:mt-0 px-6 py-3 rounded-xl font-bold text-sm bg-[#61dafbaa] text-black border border-[#61dafbaa]/20 hover:bg-[#61dafbaa] hover:text-black transition-all flex items-center gap-2 shadow-sm">
                                    Open Deck <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Practice Mode Card */}
                    {quiz.type !== 'master' && (
                        <div
                            onClick={() => navigate(`/student/practice/setup/${id}`)}
                            className="group relative bg-surface hover:bg-surface-highlight border border-neutral-800 hover:border-blue-500/50 rounded-3xl p-8 cursor-pointer transition-all duration-500 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16" />

                            <div className="relative z-10 flex flex-col h-full">

                                <h3 className="text-xl font-bold text-text mb-2 group-hover:text-blue-400 transition-colors">Practice Test</h3>
                                <p className="text-muted text-sm leading-relaxed mb-8 flex-1">
                                    Untimed learning environment with instant feedback and AI-powered explanations.
                                </p>
                                <div className="flex items-center text-sm font-bold text-[#61dafbaa] group-hover:translate-x-1 transition-transform">
                                    Start Practice <ArrowRight className="w-4 h-4 ml-2" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Mock Test Card */}
                    {(() => {
                        const isMaster = quiz.type === 'master';
                        const startTime = quiz.settings?.scheduledAt ? new Date(quiz.settings.scheduledAt) : null;
                        const isNotStartedYet = startTime && new Date() < startTime;

                        return (
                            <div
                                onClick={() => !isNotStartedYet && navigate(`/student/test/${id}`)}
                                className={`group relative bg-surface border border-neutral-800 rounded-3xl p-8 transition-all duration-500 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both ${isMaster ? 'md:col-span-2' : ''} ${isNotStartedYet ? 'opacity-70 cursor-not-allowed' : 'hover:bg-surface-highlight hover:border-cyan-500/50 cursor-pointer hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1'}`}
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-16 -mt-16" />

                                <div className="relative z-10 flex flex-col h-full">

                                    <h3 className={`text-xl font-bold mb-2 transition-colors ${isNotStartedYet ? 'text-text' : 'text-text group-hover:text-cyan-400'}`}>
                                        Mock Test
                                    </h3>
                                    <p className="text-muted text-sm leading-relaxed mb-8 flex-1">
                                        {isNotStartedYet
                                            ? `This test has not started yet. Please wait until ${startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`
                                            : "Full exam simulation under strict timed conditions. Get detailed analytics and global ranking."}
                                    </p>
                                    <div className={`flex items-center text-sm font-bold transition-transform ${isNotStartedYet ? 'text-muted' : 'text-[#61dafbaa] group-hover:translate-x-1'}`}>
                                        {isNotStartedYet ? 'Scheduled' : 'Begin Exam'} {!isNotStartedYet && <ArrowRight className="w-4 h-4 ml-2" />}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default QuizDetails;
