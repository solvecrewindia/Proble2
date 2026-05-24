import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { ArrowLeft, Loader2, RotateCw, Lightbulb, ZoomIn } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MathText } from '../../shared/components/MathText';

interface ReferenceCard {
    id: number;
    question: string;
    answer: string;
    type: string;
    options?: any[];
    imageUrl?: string;
}

const FlashCards = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [questions, setQuestions] = useState<ReferenceCard[]>([]);
    const [title, setTitle] = useState('');

    // State to track which cards are flipped
    const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});
    const [hoveredImage, setHoveredImage] = useState<string | null>(null);

    useEffect(() => {
        const fetchContent = async () => {
            if (!id) return;
            try {
                // Fetch Quiz Details via Secure API
                try {
                    const quizData = await api.get(`/quizzes/${id}`);
                    if (quizData) setTitle(quizData.title);
                } catch (err) {
                    console.error("Failed to fetch quiz details via secure API:", err);
                }

                // Fetch Questions
                const { data, error } = await supabase
                    .from('questions')
                    .select('*')
                    .eq('quiz_id', id)
                    .limit(10); // Limit to 10 cards as requested

                if (error) throw error;

                if (data) {
                    const processed = data.map((q: any, index: number) => {
                        let answerText = "Answer not available";

                        try {
                            // Determine Correct Answer Text
                            if (q.type === 'msq') {
                                const correctIndices = JSON.parse(q.correct_answer || '[]');
                                const correctOptions = correctIndices.map((i: number) => {
                                    const opt = q.choices[i];
                                    return typeof opt === 'object' ? opt.text : opt;
                                });
                                answerText = correctOptions.join(', ');
                            } else if (q.type === 'range') {
                                const range = JSON.parse(q.correct_answer || '{}');
                                answerText = `${range.min} - ${range.max}`;
                            } else {
                                // Single Choice (MCQ)
                                const correctIndex = Number(q.correct_answer) || 0;
                                const opt = q.choices ? q.choices[correctIndex] : null;
                                if (opt) {
                                    answerText = typeof opt === 'object' ? opt.text : opt;
                                }
                            }
                        } catch (e) {
                            console.error("Error parsing answer", e);
                        }

                        return {
                            id: index,
                            question: q.text,
                            answer: answerText,
                            type: q.type,
                            options: q.choices,
                            imageUrl: q.image_url ? `${q.image_url}?t=${Date.now()}` : undefined
                        };
                    });
                    setQuestions(processed);
                }
            } catch (err) {
                console.error("Error fetching flashcards:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchContent();
    }, [id]);

    const handleCardClick = (index: number) => {
        setFlippedCards(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="min-h-screen bg-background text-foreground p-6 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold">{title}</h1>
                        <p className="text-muted-foreground text-sm">Flashcards • {questions.length} Cards</p>
                    </div>
                </div>

                {/* Grid - 5 columns for "up 5 down 5" layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 perspective-1000">
                    {questions.map((card, index) => (
                        <div
                            key={card.id}
                            className={cn(
                                "group relative h-80 cursor-pointer perspective-1000 opacity-0 animate-slide-up",
                                // "perspective" class is essential for 3d flip
                            )}
                            style={{
                                animationDelay: `${index * 100}ms`,
                                animationFillMode: 'forwards'
                            }}
                            onClick={() => handleCardClick(card.id)}
                        >
                            <div className={cn(
                                "w-full h-full relative transition-all duration-500 transform-style-3d shadow-lg rounded-xl",
                                flippedCards[card.id] ? "rotate-y-180" : ""
                            )}>
                                {/* Front Face (Question) */}
                                <div className="absolute inset-0 backface-hidden bg-surface border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-primary/50 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary shrink-0">
                                        <Lightbulb className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 w-full overflow-y-auto no-scrollbar pr-2 flex flex-col items-center justify-center">
                                        {card.imageUrl && (
                                            <div
                                                className="relative group/image mb-3 cursor-pointer"
                                                onMouseEnter={() => setHoveredImage(card.imageUrl || null)}
                                                onMouseLeave={() => setHoveredImage(null)}
                                            >
                                                <img
                                                    src={card.imageUrl}
                                                    alt="Question"
                                                    className="max-h-24 rounded-lg border border-neutral-300 dark:border-neutral-600 object-contain hover:opacity-80 transition-opacity"
                                                />
                                            </div>
                                        )}
                                        <MathText text={card.question} className="font-medium text-sm select-none text-text leading-relaxed" as="h3" />
                                    </div>
                                    <p className="mt-4 text-[10px] text-muted-foreground uppercase tracking-widest shrink-0 font-bold opacity-70">Tap to reveal</p>
                                </div>

                                {/* Back Face (Answer) */}
                                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-primary/5 border-2 border-primary rounded-xl p-6 flex flex-col items-center justify-center text-center">
                                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center mb-4 shadow-lg shadow-primary/25 shrink-0">
                                        <RotateCw className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 w-full overflow-y-auto no-scrollbar pr-2 flex items-center justify-center">
                                        <MathText text={card.answer} className="font-semibold text-sm text-primary select-none leading-relaxed" as="h3" />
                                    </div>
                                    <p className="mt-4 text-[10px] text-primary/60 uppercase tracking-widest shrink-0 font-bold opacity-70">Tap to hide</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <style>{`
                    .perspective-1000 { perspective: 1000px; }
                    .transform-style-3d { transform-style: preserve-3d; }
                    .backface-hidden { backface-visibility: hidden; }
                    .rotate-y-180 { transform: rotateY(180deg); }
                    .no-scrollbar::-webkit-scrollbar { display: none; }
                    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                    
                    @keyframes slideUp {
                        from {
                            opacity: 0;
                            transform: translateY(20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    .animate-slide-up {
                        animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    }
                `}</style>
            </div>

            {/* Hover Zoom Overlay - Centered and Large */}
            {
                hoveredImage && (
                    <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center p-4">
                        <div className="bg-black/95 backdrop-blur-sm p-2 rounded-xl border border-white/20 shadow-2xl animate-in zoom-in-95 duration-200">
                            <img
                                src={hoveredImage}
                                alt="Zoomed Question"
                                className="max-h-[70vh] max-w-[80vw] object-contain rounded-lg"
                            />
                        </div>
                    </div>
                )
            }

        </div >
    );
};

export default FlashCards;
