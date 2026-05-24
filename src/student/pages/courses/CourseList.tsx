import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../lib/api';
import { Loader2, ArrowLeft, BookOpen, GraduationCap, Building2, MonitorPlay } from 'lucide-react';

const CourseList = () => {
    const { module } = useParams(); // 'placement', 'srmist', 'nptel'
    const navigate = useNavigate();

    const [courses, setCourses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const getModuleConfig = (type: string | undefined) => {
        switch (type) {
            case 'placement':
                return { title: 'Placement Training', icon: Building2, color: 'text-orange-500', bg: 'bg-orange-500/10' };
            case 'srmist':
                return { title: 'SRMIST Academics', icon: GraduationCap, color: 'text-blue-500', bg: 'bg-blue-500/10' };
            case 'nptel':
                return { title: 'NPTEL Courses', icon: MonitorPlay, color: 'text-green-500', bg: 'bg-green-500/10' };
            default:
                return { title: 'Courses', icon: BookOpen, color: 'text-primary', bg: 'bg-primary/10' };
        }
    };

    const config = getModuleConfig(module);

    useEffect(() => {
        const fetchCourses = async () => {
            setLoading(true);
            try {
                // Fetch all quizzes from our secure, portable monolithic backend!
                const data = await api.get('/quizzes');
                
                // Filter courses dynamically based on module type and status
                const filtered = (data || []).filter((course: any) => 
                    course.type === (module || 'global') && course.status === 'active'
                );
                
                setCourses(filtered);
            } catch (error) {
                console.error('Error fetching courses from API:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCourses();
    }, [module]);

    return (
        <div className="min-h-screen bg-background text-text py-8">
            <section className="w-full flex justify-center">
                <div className="w-full max-w-6xl px-6">
                    {/* Header Section */}
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/student/dashboard')}
                                className="p-2 -ml-2 rounded-lg hover:bg-surface transition-colors"
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${config.bg}`}>
                                    <config.icon className={`w-6 h-6 ${config.color}`} />
                                </div>
                                <h1 className="text-2xl font-bold">{config.title}</h1>
                            </div>
                        </div>

                        {!loading && courses.length > 0 && (
                            <span className="text-sm text-muted-foreground font-medium hidden md:block">
                                Showing {courses.length} result{courses.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {/* Content Section */}
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : courses.length === 0 ? (
                        <div className="text-center py-12 text-muted">
                            <p className="text-lg">No courses available in this module yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {courses.map((course) => (
                                <div
                                    key={course.id}
                                    onClick={() => navigate(`/course/details/${course.id}`)}
                                    className="bg-surface border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer group hover:-translate-y-1"
                                >
                                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{course.title}</h3>
                                    <p className="text-muted text-sm line-clamp-2">{course.description || 'No description available.'}</p>
                                    <div className="mt-4 flex items-center text-xs font-medium text-muted gap-2">
                                        <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded">
                                            {course.questions_count || '?'} Questions
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default CourseList;
