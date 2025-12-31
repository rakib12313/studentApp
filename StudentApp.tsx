import React, { useState, useEffect } from 'react';
import { 
    LayoutDashboard, BookOpen, FileText, Trophy, User as UserIcon,
    Bell, Clock, AlertTriangle, CheckCircle, X, LogOut,
    Play, ChevronRight, Download, Eye, Shield, AlertOctagon, Lock, Mail, Loader2,
    Calendar, Star, TrendingUp, Zap, Wifi, WifiOff, Camera, Maximize2, Upload, Search, Filter,
    BarChart3, Check, X as XIcon, RotateCcw
} from 'lucide-react';
import { Card, Button, Input, Modal, Badge, ProgressBar, Skeleton } from './components/UI';
import { AppState, Student, Exam, LibraryItem, ExamResult, Question } from './types';
import { auth, db, uploadToCloudinary } from './services';
import { ref, onValue, set, update, push, onDisconnect, get } from 'firebase/database';
import { 
    onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    signInWithPopup, GoogleAuthProvider, signOut, sendPasswordResetEmail, User 
} from 'firebase/auth';

interface ToastMsg { id: number; message: string; type: 'success' | 'error' | 'warning' | 'info'; }

const StudentApp: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [studentProfile, setStudentProfile] = useState<Student | null>(null);
    
    // Initialize State from LocalStorage for Offline Support
    const loadCachedState = (): AppState => {
        try {
            const cached = localStorage.getItem('lms_student_cache');
            return cached ? JSON.parse(cached) : { students: [], notices: [], library: [], exams: [], results: [] };
        } catch (e) {
            return { students: [], notices: [], library: [], exams: [], results: [] };
        }
    };

    const [state, setState] = useState<AppState>(loadCachedState);
    const [activeTab, setActiveTab] = useState<'home' | 'library' | 'exams' | 'results' | 'profile'>('home');
    const [toasts, setToasts] = useState<ToastMsg[]>([]);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    
    // Exam State
    const [activeExam, setActiveExam] = useState<Exam | null>(null);
    const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [cheatWarnings, setCheatWarnings] = useState(0);

    const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };

    // Online/Offline Listener
    useEffect(() => {
        const handleOnline = () => { setIsOnline(true); showToast('You are back online!', 'success'); };
        const handleOffline = () => { setIsOnline(false); showToast('You are offline. Showing cached data.', 'warning'); };
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (!currentUser) setStudentProfile(null);
            
            // Try to load cached profile if offline/loading
            if (currentUser) {
                const cachedProfile = localStorage.getItem(`lms_profile_${currentUser.uid}`);
                if (cachedProfile) setStudentProfile(JSON.parse(cachedProfile));
            }

            setLoadingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    // Dedicated Profile Listener & Global Data Listener
    useEffect(() => {
        if (!user) return;
        
        const dbRef = ref(db);
        const profileRef = ref(db, `students/${user.uid}`);
        
        const unsubscribeProfile = onValue(profileRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setStudentProfile(data as Student);
                localStorage.setItem(`lms_profile_${user.uid}`, JSON.stringify(data));
                
                if (data.status === 'banned') {
                    signOut(auth);
                    alert("Access Revoked: Please contact administration.");
                }
            }
        });

        let unsubscribeGlobal = () => {};
        if (navigator.onLine) {
            unsubscribeGlobal = onValue(dbRef, (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    const newState = {
                        students: data.students ? Object.values(data.students) as Student[] : [],
                        notices: data.notices ? Object.values(data.notices) : [],
                        library: data.library ? Object.values(data.library) : [],
                        exams: data.exams ? Object.values(data.exams) : [],
                        results: data.results ? Object.values(data.results) : []
                    };
                    
                    setState(newState);
                    localStorage.setItem('lms_student_cache', JSON.stringify(newState));
                }
            });
        }

        return () => {
            unsubscribeProfile();
            unsubscribeGlobal();
        };
    }, [user, isOnline]);

    useEffect(() => {
        if (!user || !isOnline) return;
        const myRef = ref(db, `students/${user.uid}`);
        get(myRef).then((snapshot) => {
            if (!snapshot.exists()) {
                const newStudent: Student = {
                    id: user.uid,
                    name: user.displayName || 'Student',
                    email: user.email || '',
                    phone: '',
                    status: 'active',
                    avatar: user.photoURL || undefined,
                    joinedAt: new Date().toLocaleDateString(),
                    isOnline: true
                };
                set(myRef, newStudent);
            } else {
                update(myRef, { isOnline: true });
            }
        });
        onDisconnect(myRef).update({ isOnline: false });
        return () => { if (auth.currentUser) update(myRef, { isOnline: false }); };
    }, [user, isOnline]);

    // Anti-Cheat & Timer
    useEffect(() => {
        if (!activeExam) return;
        const handleVisibilityChange = () => {
            if (document.hidden) {
                const newWarnings = cheatWarnings + 1;
                setCheatWarnings(newWarnings);
                if (newWarnings >= 3) {
                    submitExam(true);
                    alert("Exam terminated due to multiple tab switches.");
                } else {
                    showToast(`Warning ${newWarnings}/3: Tab switching detected!`, 'warning');
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    submitExam(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(timer);
        };
    }, [activeExam, cheatWarnings, timeLeft]);

    // Timer Warning Effect
    useEffect(() => {
        if (!activeExam) return;
        if (timeLeft === 300) showToast("⚠️ 5 minutes remaining!", 'warning');
        if (timeLeft === 60) showToast("⚠️ 1 minute remaining! Submit soon.", 'error');
    }, [timeLeft, activeExam]);

    // Persistence for Exam Answers
    useEffect(() => {
        if (activeExam) {
            localStorage.setItem(`exam_progress_${activeExam.id}`, JSON.stringify(examAnswers));
        }
    }, [examAnswers, activeExam]);

    const handleLogout = async () => {
        if (user && isOnline) await update(ref(db, `students/${user.uid}`), { isOnline: false });
        await signOut(auth);
        localStorage.removeItem('lms_student_cache');
        localStorage.removeItem(`lms_profile_${user?.uid}`);
    };

    const startExam = (exam: Exam, isRetake = false) => {
        if (!isOnline) {
            showToast("You must be online to take exams.", 'error');
            return;
        }
        if (!user) return;
        
        // Check if taken previously (unless retaking)
        if (!isRetake && state.results.some(r => r.examId === exam.id && r.studentId === user.uid)) {
            showToast("You have already completed this exam.", 'error'); 
            return;
        }
        
        // Restore progress if exists (only for fresh start, not necessarily retake, but logic is same)
        // If retake, we probably shouldn't restore old progress, but for now we'll leave it as local storage clears on submit
        const savedProgress = localStorage.getItem(`exam_progress_${exam.id}`);
        let initialAnswers = {};
        if (savedProgress && !isRetake) { 
            try { initialAnswers = JSON.parse(savedProgress); } catch(e){}
        } else if (isRetake) {
             localStorage.removeItem(`exam_progress_${exam.id}`); // Clear old data for retake
        }

        if(confirm(`${isRetake ? 'Retake' : 'Start'} ${exam.title}? This will enter full-screen mode.`)) {
            setActiveExam(exam);
            setExamAnswers(initialAnswers);
            setTimeLeft(exam.durationMinutes * 60);
            setCheatWarnings(0);
            document.documentElement.requestFullscreen().catch(() => {});
        }
    };

    const submitExam = (auto = false) => {
        if (!activeExam || !user || !studentProfile) return;
        
        if (!navigator.onLine) {
            alert("Connection lost! Please reconnect to submit your exam.");
            return;
        }

        let score = 0;
        const total = activeExam.questions.length;
        if (activeExam.type === 'mcq') {
            activeExam.questions.forEach(q => { if (examAnswers[q.id] === q.answer) score++; });
        }
        const result: ExamResult = {
            id: `res-${Date.now()}`,
            examId: activeExam.id,
            examTitle: activeExam.title,
            studentId: user.uid,
            studentName: studentProfile.name,
            score: activeExam.type === 'mcq' ? score : 0,
            totalScore: total,
            date: new Date().toLocaleDateString(),
            status: activeExam.type === 'mcq' ? (score >= total/2 ? 'passed' : 'failed') : 'needs_check',
            answers: examAnswers // Submit specific answers
        };
        
        push(ref(db, 'results'), result);
        
        // Clear local storage progress
        localStorage.removeItem(`exam_progress_${activeExam.id}`);
        
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        setActiveExam(null);
        showToast(auto ? "Time's up! Exam submitted." : "Exam completed successfully!", 'success');
        setActiveTab('results');
    };

    if (loadingAuth) return <div className="min-h-screen flex items-center justify-center bg-[#050507]"><Loader2 size={40} className="text-blue-500 animate-spin" /></div>;
    if (!user) return <AuthScreen showToast={showToast} isOnline={isOnline} />;

    // --- Active Exam UI ---
    if (activeExam) {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const totalTime = activeExam.durationMinutes * 60;
        const progressPercent = (timeLeft / totalTime) * 100;
        
        return (
            <div className="fixed inset-0 z-50 bg-[#050507] flex flex-col">
                <div className="h-20 border-b border-white/5 bg-[#0a0a0e] flex items-center justify-between px-8 backdrop-blur-md relative overflow-hidden">
                    {/* Timer Progress Bar Background */}
                    <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 ease-linear" style={{ width: `${progressPercent}%` }}></div>

                    <div className="flex items-center gap-4 z-10">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><FileText size={24} /></div>
                        <div>
                            <h2 className="font-heading font-bold text-xl text-white tracking-wide">{activeExam.title}</h2>
                            <p className="text-xs text-gray-500">ID: {activeExam.id.slice(-6).toUpperCase()}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 z-10">
                        {!isOnline && <Badge variant="danger">OFFLINE - DO NOT CLOSE</Badge>}
                        <div className="text-right hidden md:block">
                            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Time Remaining</p>
                            <div className={`font-mono text-2xl font-bold ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                                {mins}:{secs < 10 ? `0${secs}` : secs}
                            </div>
                        </div>
                        <Button variant="success" onClick={() => submitExam()} disabled={!isOnline}>Submit Exam</Button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar Questions */}
                    <div className="w-64 bg-[#08080a] border-r border-white/5 hidden lg:flex flex-col p-6 overflow-y-auto">
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-4">Question Map</p>
                        <div className="grid grid-cols-4 gap-2">
                            {activeExam.questions.map((q, i) => (
                                <button key={q.id} 
                                    onClick={() => document.getElementById(`q-${i}`)?.scrollIntoView({behavior: 'smooth'})}
                                    className={`aspect-square rounded-lg text-sm font-bold transition-all ${examAnswers[q.id] ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full custom-scrollbar">
                        <div className="mb-6 flex justify-between items-end">
                             <div>
                                <h1 className="text-2xl font-heading font-bold mb-2">Examination in Progress</h1>
                                <p className="text-gray-400 text-sm">Please answer all questions carefully. Tab switching is strictly prohibited.</p>
                             </div>
                             <div className="text-right">
                                <Badge variant="warning">{cheatWarnings}/3 Warnings</Badge>
                             </div>
                        </div>

                        {activeExam.type === 'mcq' ? (
                            <div className="space-y-8 pb-20">
                                {activeExam.questions.map((q, idx) => (
                                    <div id={`q-${idx}`} key={q.id} className="glass-card p-6 md:p-8 rounded-2xl group hover:border-blue-500/30 transition-colors">
                                        <div className="flex gap-4">
                                            <span className="text-blue-500 font-mono text-xl font-bold opacity-50">0{idx + 1}</span>
                                            <div className="w-full">
                                                <p className="text-xl md:text-2xl font-medium mb-6 text-gray-100 leading-relaxed">{q.question}</p>
                                                <div className="grid md:grid-cols-2 gap-3">
                                                    {q.options.map((opt, oIdx) => (
                                                        <label key={oIdx} className={`relative flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border ${examAnswers[q.id] === opt ? 'bg-blue-600/10 border-blue-500 text-white' : 'bg-black/20 border-white/5 hover:bg-white/5 text-gray-400'}`}>
                                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${examAnswers[q.id] === opt ? 'border-blue-500' : 'border-gray-600'}`}>
                                                                {examAnswers[q.id] === opt && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                                                            </div>
                                                            <span className="text-sm md:text-base font-medium">{opt}</span>
                                                            <input type="radio" name={q.id} value={opt} className="hidden" onChange={() => setExamAnswers(prev => ({ ...prev, [q.id]: opt }))} />
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col h-full gap-6">
                                <div className="flex-1 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden min-h-[400px]">
                                    {activeExam.fileUrl ? (
                                        activeExam.fileUrl.endsWith('.pdf') ? <iframe src={activeExam.fileUrl} className="w-full h-full" /> : <img src={activeExam.fileUrl} className="max-w-full max-h-full object-contain" />
                                    ) : <p className="text-gray-500">Resource unavailable.</p>}
                                </div>
                                <Card title="Your Response">
                                    <textarea 
                                        className="w-full h-40 bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:border-blue-500 outline-none resize-none" 
                                        placeholder="Type your detailed answer here..." 
                                        value={examAnswers['essay'] || ''}
                                        onChange={(e) => setExamAnswers({ ...examAnswers, essay: e.target.value })}
                                    />
                                </Card>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-24 md:pb-0 md:pl-24 text-white font-sans selection:bg-blue-500/30">
            <ToastContainer toasts={toasts} />
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex fixed top-0 bottom-0 left-0 w-24 flex-col items-center py-8 bg-[#08080a]/80 backdrop-blur-xl border-r border-white/5 z-40">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-bold text-2xl shadow-[0_0_30px_rgba(37,99,235,0.4)] mb-12">S</div>
                <div className="flex flex-col gap-8 w-full px-4">
                    <SidebarIcon icon={<LayoutDashboard />} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
                    <SidebarIcon icon={<BookOpen />} label="Library" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
                    <SidebarIcon icon={<FileText />} label="Exams" active={activeTab === 'exams'} onClick={() => setActiveTab('exams')} />
                    <SidebarIcon icon={<Trophy />} label="Results" active={activeTab === 'results'} onClick={() => setActiveTab('results')} />
                    <SidebarIcon icon={<UserIcon />} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
                </div>
                <button onClick={handleLogout} className="mt-auto p-4 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors group">
                    <LogOut size={22} className="group-hover:-translate-x-1 transition-transform" />
                </button>
            </div>

            {/* Mobile Navigation */}
            <div className="fixed bottom-4 left-4 right-4 h-16 bg-[#121216]/90 backdrop-blur-xl border border-white/10 rounded-2xl flex justify-around items-center px-1 z-40 md:hidden shadow-2xl">
                <NavBtn icon={<LayoutDashboard />} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
                <NavBtn icon={<BookOpen />} label="Library" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
                <div className="relative -top-6">
                    <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-600/40 text-white cursor-pointer hover:scale-105 transition-transform border-4 border-[#121216]" onClick={() => setActiveTab('exams')}>
                        <Play fill="white" size={24} className="ml-1" />
                    </div>
                </div>
                <NavBtn icon={<Trophy />} label="Results" active={activeTab === 'results'} onClick={() => setActiveTab('results')} />
                <NavBtn icon={<UserIcon />} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
            </div>

            <main className="p-6 md:p-12 max-w-7xl mx-auto animate-fade-in">
                {/* Top Bar */}
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h1 className="text-3xl font-heading font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            Welcome, {studentProfile?.name.split(' ')[0] || 'Student'}
                        </h1>
                        <p className="text-gray-400 mt-1 flex items-center gap-2">
                            <Clock size={14} /> {new Date().toLocaleDateString(undefined, {weekday: 'long', month: 'long', day: 'numeric'})}
                            {!isOnline && <span className="text-red-400 flex items-center gap-1 font-bold ml-2 bg-red-500/10 px-2 py-0.5 rounded"><WifiOff size={12}/> Offline Mode</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end mr-2">
                            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Level 1</span>
                            <div className="w-24 h-1.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
                                <div className="h-full bg-blue-500 w-1/3"></div>
                            </div>
                        </div>
                        <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-blue-500 to-purple-500 shadow-lg shadow-purple-500/20 overflow-hidden">
                            <img src={studentProfile?.avatar || `https://ui-avatars.com/api/?name=${studentProfile?.name || 'User'}&background=000&color=fff`} className="w-full h-full rounded-full object-cover bg-black" />
                        </div>
                    </div>
                </div>

                {activeTab === 'home' && <HomeTab state={state} studentId={user.uid} setActiveTab={setActiveTab} />}
                {activeTab === 'library' && <LibraryTab library={state.library} isOnline={isOnline} />}
                {activeTab === 'exams' && <ExamsTab exams={state.exams} results={state.results} studentId={user.uid} onStart={startExam} isOnline={isOnline} />}
                {activeTab === 'results' && <ResultsTab results={state.results} studentId={user.uid} exams={state.exams} onRetake={(e) => startExam(e, true)} />}
                {activeTab === 'profile' && <ProfileTab profile={studentProfile} results={state.results} studentId={user.uid} isOnline={isOnline} />}
            </main>
        </div>
    );
};

// --- Sub-Components with Enhanced UI ---

const HomeTab = ({ state, studentId, setActiveTab }: { state: AppState, studentId: string, setActiveTab: any }) => {
    const myResults = state.results.filter(r => r.studentId === studentId);
    const avgScore = myResults.length > 0 ? Math.round(myResults.reduce((acc, curr) => acc + (curr.score/curr.totalScore)*100, 0) / myResults.length) : 0;
    const pendingExams = state.exams.filter(e => e.status === 'published' && !myResults.find(r => r.examId === e.id));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                {/* Highlight Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Card className="bg-gradient-to-br from-blue-600/20 to-blue-900/10 border-blue-500/20 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-20 group-hover:scale-110 transition-transform"><Trophy size={48} /></div>
                        <h3 className="text-3xl font-bold text-white mb-1">{myResults.length}</h3>
                        <p className="text-sm text-blue-300 uppercase tracking-wider font-semibold">Exams Completed</p>
                    </Card>
                    <Card className="bg-gradient-to-br from-purple-600/20 to-purple-900/10 border-purple-500/20 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-20 group-hover:scale-110 transition-transform"><TrendingUp size={48} /></div>
                        <h3 className="text-3xl font-bold text-white mb-1">{avgScore}%</h3>
                        <p className="text-sm text-purple-300 uppercase tracking-wider font-semibold">Average Score</p>
                    </Card>
                    <Card className="bg-gradient-to-br from-emerald-600/20 to-emerald-900/10 border-emerald-500/20 relative overflow-hidden group col-span-2 md:col-span-1">
                         <div className="absolute right-0 top-0 p-4 opacity-20 group-hover:scale-110 transition-transform"><Zap size={48} /></div>
                        <h3 className="text-3xl font-bold text-white mb-1">{pendingExams.length}</h3>
                        <p className="text-sm text-emerald-300 uppercase tracking-wider font-semibold">Pending Tasks</p>
                    </Card>
                </div>

                {/* Recent Notices */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-heading font-bold">Announcements</h3>
                        <Badge variant="neutral">{state.notices.length} New</Badge>
                    </div>
                    {state.notices.length === 0 ? (
                        <div className="glass-panel p-8 rounded-2xl text-center text-gray-500 border-dashed">
                            <Bell size={32} className="mx-auto mb-3 opacity-50" />
                            <p>All caught up! No new announcements.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {state.notices.slice().reverse().map(n => (
                                <div key={n.id} className="glass-card p-5 rounded-2xl flex gap-4 items-start group">
                                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                        <Bell size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-gray-200 leading-relaxed text-sm">{n.content}</p>
                                        <p className="text-[10px] text-gray-500 mt-2 font-mono uppercase">{n.timestamp}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Side Panel: Pending Exams */}
            <div className="space-y-6">
                 <div className="glass-panel p-6 rounded-2xl border-t-4 border-t-orange-500">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><AlertOctagon size={18} className="text-orange-500"/> Priority Tasks</h3>
                    {pendingExams.length > 0 ? (
                        <div className="space-y-3">
                            {pendingExams.slice(0, 3).map(e => (
                                <div key={e.id} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-white/5" onClick={() => setActiveTab('exams')}>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-sm truncate w-32">{e.title}</span>
                                        <Badge variant="warning">{e.durationMinutes}m</Badge>
                                    </div>
                                    <div className="text-xs text-gray-400">{e.questions.length} Questions</div>
                                </div>
                            ))}
                            <Button variant="ghost" className="w-full text-xs" onClick={() => setActiveTab('exams')}>View All</Button>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            <CheckCircle size={24} className="mx-auto mb-2 text-green-500/50" />
                            <p>You're all set! No pending exams.</p>
                        </div>
                    )}
                 </div>
                 
                 {/* Mini Library Promo */}
                 <div className="glass-card p-6 rounded-2xl relative overflow-hidden bg-gradient-to-br from-indigo-900/40 to-black">
                     <div className="relative z-10">
                         <h4 className="font-bold text-lg mb-2">Study Materials</h4>
                         <p className="text-xs text-gray-400 mb-4">Access {state.library.length} resources to prepare.</p>
                         <Button size="sm" variant="glass" onClick={() => setActiveTab('library')}>Open Library</Button>
                     </div>
                     <BookOpen className="absolute -bottom-4 -right-4 text-indigo-500/20 w-32 h-32 rotate-12" />
                 </div>
            </div>
        </div>
    );
};

const LibraryTab = ({ library, isOnline }: { library: LibraryItem[], isOnline: boolean }) => {
    const [viewItem, setViewItem] = useState<LibraryItem | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'pdf' | 'image'>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az'>('newest');

    const filteredLibrary = library
        .filter(item => {
            const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  item.subject.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesType = filterType === 'all' || item.type === filterType;
            return matchesSearch && matchesType;
        })
        .sort((a, b) => {
            if (sortBy === 'az') return a.title.localeCompare(b.title);
            const dateA = new Date(a.addedAt).getTime();
            const dateB = new Date(b.addedAt).getTime();
            return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
        });

    return (
        <div className="space-y-6">
            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row gap-4 mb-8 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-12 pr-4 text-sm focus:border-blue-500 focus:outline-none transition-colors"
                        placeholder="Search by title or subject..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-4">
                    <div className="relative min-w-[140px]">
                        <select 
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as any)}
                        >
                            <option value="all">All Types</option>
                            <option value="pdf">PDF Documents</option>
                            <option value="image">Images</option>
                        </select>
                        <Filter className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" size={14} />
                    </div>
                    <div className="relative min-w-[140px]">
                        <select 
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                        >
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                            <option value="az">A-Z Title</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredLibrary.length > 0 ? (
                    filteredLibrary.map(item => (
                        <div key={item.id} className="glass-card p-5 rounded-2xl group cursor-pointer hover:border-blue-500/40" onClick={() => setViewItem(item)}>
                            <div className="flex items-start justify-between mb-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-lg ${item.type === 'pdf' ? 'bg-red-500/10 text-red-500 shadow-red-500/10' : 'bg-blue-500/10 text-blue-500 shadow-blue-500/10'}`}>
                                    {item.type === 'pdf' ? <FileText /> : <Eye />}
                                </div>
                                <span className="text-[10px] uppercase font-bold text-gray-500 bg-white/5 px-2 py-1 rounded-md group-hover:bg-white/10 transition-colors">
                                    {item.type}
                                </span>
                            </div>
                            <h4 className="font-bold text-white text-lg leading-tight mb-1 line-clamp-2 group-hover:text-blue-400 transition-colors">{item.title}</h4>
                            <p className="text-sm text-gray-400 mb-4">{item.subject}</p>
                            
                            <div className="flex items-center text-xs text-gray-500 gap-2 mt-auto pt-4 border-t border-white/5">
                                <Calendar size={12} /> {item.addedAt}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full text-center py-20 text-gray-500">
                        <Search size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-lg">No resources found</p>
                        <p className="text-sm">Try adjusting your search or filters</p>
                    </div>
                )}
            </div>
            
            {/* Full Screen Viewer Overlay */}
            {viewItem && (
                <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">
                    <div className="flex justify-between items-center p-4 border-b border-white/10 bg-[#0a0a0e]">
                        <h2 className="text-lg font-bold text-white truncate max-w-md">{viewItem.title}</h2>
                        <div className="flex items-center gap-2">
                             {viewItem.allowDownload ? (
                                <a href={viewItem.url} target="_blank" download className="p-2 hover:bg-white/10 rounded-full text-blue-400 transition-colors" title="Download">
                                    <Download size={20} />
                                </a>
                            ) : (
                                <span className="p-2 text-gray-500 cursor-not-allowed" title="Download Disabled"><Lock size={20}/></span>
                            )}
                            <button onClick={() => setViewItem(null)} className="p-2 hover:bg-red-500/20 rounded-full text-gray-400 hover:text-red-400 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-hidden relative flex items-center justify-center p-4">
                        {isOnline || viewItem ? (
                            viewItem.type === 'pdf' ? (
                                <iframe src={viewItem.url} className="w-full h-full rounded-lg border border-white/10 bg-white" />
                            ) : (
                                <img src={viewItem.url} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                            )
                        ) : (
                             <div className="flex flex-col items-center justify-center text-gray-500">
                                <WifiOff size={48} className="mb-4 opacity-50"/>
                                <p className="text-xl">Preview unavailable offline</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const ExamsTab = ({ exams, results, studentId, onStart, isOnline }: { exams: Exam[], results: ExamResult[], studentId: string, onStart: (e: Exam) => void, isOnline: boolean }) => {
    const published = exams.filter(e => e.status === 'published');
    
    return (
        <div className="space-y-4">
            {published.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle size={32} className="opacity-50" />
                    </div>
                    <p className="text-lg font-medium">No active exams found</p>
                    <p className="text-sm">Check back later or visit the library.</p>
                </div>
            )}
            
            <div className="grid gap-4">
                {published.map(exam => {
                    const isTaken = results.some(r => r.examId === exam.id && r.studentId === studentId);
                    return (
                        <div key={exam.id} className="glass-card p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:border-blue-500/30">
                            <div className="flex gap-5 items-center">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl shadow-lg shrink-0 ${isTaken ? 'bg-green-500/10 text-green-500' : 'bg-gradient-to-br from-blue-600 to-purple-600 text-white'}`}>
                                    {isTaken ? <CheckCircle /> : <FileText />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl text-white group-hover:text-blue-400 transition-colors">{exam.title}</h3>
                                    <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-2 font-medium uppercase tracking-wide">
                                        <span className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded"><Clock size={12}/> {exam.durationMinutes} min</span>
                                        <span className="bg-white/5 px-2 py-1 rounded">{exam.questions.length} Items</span>
                                        <span className="bg-white/5 px-2 py-1 rounded">{exam.type}</span>
                                    </div>
                                </div>
                            </div>
                            
                            {isTaken ? (
                                <div className="px-6 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-bold text-sm flex items-center gap-2">
                                    <CheckCircle size={16} /> Completed
                                </div>
                            ) : (
                                <Button onClick={() => onStart(exam)} size="lg" className="w-full md:w-auto shadow-blue-500/20" disabled={!isOnline}>
                                    {isOnline ? 'Start Exam' : 'Offline'} <Play size={18} fill="currentColor" />
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const ResultsTab = ({ results, studentId, exams, onRetake }: { results: ExamResult[], studentId: string, exams: Exam[], onRetake: (e: Exam) => void }) => {
    const myResults = results.filter(r => r.studentId === studentId).reverse();
    const [viewAnalysis, setViewAnalysis] = useState<{ result: ExamResult, exam: Exam | undefined } | null>(null);

    if (myResults.length === 0) return <div className="text-center py-20 text-gray-500">No history found. Complete an exam to see results here.</div>;

    const openAnalysis = (res: ExamResult) => {
        const exam = exams.find(e => e.id === res.examId);
        setViewAnalysis({ result: res, exam });
    };

    return (
        <>
            <div className="grid gap-4 md:grid-cols-2">
                {myResults.map(res => (
                    <div key={res.id} className="glass-card p-6 rounded-2xl relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-6 relative z-10">
                            <div>
                                <h3 className="font-bold text-lg text-white mb-1">{res.examTitle}</h3>
                                <p className="text-xs text-gray-500">{res.date}</p>
                            </div>
                            <Badge variant={res.status === 'passed' ? 'success' : res.status === 'failed' ? 'danger' : 'warning'}>
                                {res.status.toUpperCase().replace('_', ' ')}
                            </Badge>
                        </div>
                        
                        <div className="mb-2 flex justify-between items-end relative z-10">
                            <span className="text-4xl font-heading font-bold">{res.score}</span>
                            <span className="text-sm text-gray-400 mb-1">out of {res.totalScore}</span>
                        </div>
                        
                        <ProgressBar value={res.score} max={res.totalScore} color={res.status === 'passed' ? 'bg-emerald-500' : 'bg-red-500'} className="relative z-10" />
                        
                        <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center relative z-10">
                             {/* Retake Button */}
                             {(() => {
                                const exam = exams.find(e => e.id === res.examId);
                                if (exam && exam.status === 'published') {
                                     return (
                                        <button onClick={() => onRetake(exam)} className="text-sm text-gray-400 hover:text-white font-medium flex items-center gap-2 transition-colors">
                                            <RotateCcw size={16}/> Retake
                                        </button>
                                     )
                                }
                                return <div></div>;
                            })()}

                            <button onClick={() => openAnalysis(res)} className="text-sm text-blue-400 hover:text-white font-medium flex items-center gap-2 transition-colors">
                                View Analysis <ChevronRight size={16}/>
                            </button>
                        </div>

                        <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full opacity-10 pointer-events-none ${res.status === 'passed' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                    </div>
                ))}
            </div>

            {/* Analysis Modal */}
            <Modal isOpen={!!viewAnalysis} onClose={() => setViewAnalysis(null)} title="Performance Analysis">
                {viewAnalysis && (
                    <div className="space-y-6">
                        <div className="p-4 bg-white/5 rounded-xl text-center">
                            <h3 className="text-2xl font-bold mb-1">{viewAnalysis.result.score} / {viewAnalysis.result.totalScore}</h3>
                            <p className="text-sm text-gray-400">Final Score</p>
                        </div>

                        {viewAnalysis.exam ? (
                            <div className="space-y-4">
                                {viewAnalysis.exam.questions.map((q, idx) => {
                                    const userAnswer = viewAnalysis.result.answers ? viewAnalysis.result.answers[q.id] : null;
                                    const isCorrect = userAnswer === q.answer;
                                    
                                    return (
                                        <div key={q.id} className={`p-4 rounded-xl border ${isCorrect ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                                            <div className="flex items-start gap-3 mb-2">
                                                <div className={`mt-1 p-1 rounded-full ${isCorrect ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`}>
                                                    {isCorrect ? <Check size={12}/> : <XIcon size={12}/>}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-bold text-sm text-white mb-2">{idx + 1}. {q.question}</p>
                                                    <div className="text-xs space-y-1">
                                                        <p className={`${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                                                            <span className="opacity-70">Your Answer:</span> {userAnswer || 'Skipped'}
                                                        </p>
                                                        {!isCorrect && (
                                                            <p className="text-green-400">
                                                                <span className="opacity-70">Correct Answer:</span> {q.answer}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <AlertTriangle className="mx-auto mb-2 opacity-50"/>
                                <p>Original exam data unavailable.</p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
};

const ProfileTab = ({ profile, results, studentId, isOnline }: { profile: Student | null, results: ExamResult[], studentId: string, isOnline: boolean }) => {
    const [editMode, setEditMode] = useState(false);
    const [formData, setFormData] = useState({ 
        name: profile?.name || '', 
        phone: profile?.phone || '',
        email: profile?.email || '',
        avatar: profile?.avatar || ''
    });
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    useEffect(() => { 
        if(profile) setFormData({ 
            name: profile.name, 
            phone: profile.phone,
            email: profile.email,
            avatar: profile.avatar || ''
        }); 
    }, [profile]);
    
    const myResults = results.filter(r => r.studentId === studentId);
    const totalScore = myResults.reduce((acc, curr) => acc + curr.score, 0);
    const badges = [
        { id: 1, name: 'Novice', icon: <Star />, unlocked: myResults.length > 0 },
        { id: 2, name: 'Scholar', icon: <BookOpen />, unlocked: myResults.length >= 5 },
        { id: 3, name: 'Ace', icon: <Trophy />, unlocked: myResults.some(r => (r.score/r.totalScore) >= 0.9) },
    ];

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setUploading(true);
            try {
                const url = await uploadToCloudinary(e.target.files[0]);
                setFormData(prev => ({ ...prev, avatar: url }));
            } catch (error) {
                alert("Upload failed. Please try again.");
            } finally {
                setUploading(false);
            }
        }
    }

    const saveProfile = async () => {
        if (!studentId) return;
        if (!isOnline) { alert("Cannot update profile while offline."); return; }
        
        setSaving(true);
        try {
            await update(ref(db, `students/${studentId}`), {
                name: formData.name || '',
                phone: formData.phone || '',
                email: formData.email || '',
                avatar: formData.avatar || ''
            });
            setEditMode(false);
        } catch (error) {
            console.error(error);
            alert("Failed to save changes. Please check your connection.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid lg:grid-cols-3 gap-8">
            {/* Profile Card */}
            <div className="lg:col-span-1">
                <Card className="text-center h-full relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-blue-600/20 to-transparent"></div>
                    <div className="relative z-10">
                        {editMode ? (
                            <div className="flex flex-col items-center mb-6">
                                <div className="relative w-32 h-32 mb-4">
                                    <div className="w-full h-full rounded-full p-1 bg-gradient-to-tr from-blue-500 to-purple-500 shadow-2xl overflow-hidden relative">
                                        <img src={formData.avatar || `https://ui-avatars.com/api/?name=${formData.name}&background=000&color=fff`} className="w-full h-full rounded-full object-cover bg-black" />
                                        {uploading && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <Loader2 className="animate-spin text-white"/>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <label className="relative">
                                    <Button variant="glass" size="sm" type="button" onClick={() => document.getElementById('photo-upload')?.click()} disabled={uploading}>
                                        <Upload size={16}/> {uploading ? 'Uploading...' : 'Upload Photo'}
                                    </Button>
                                    <input 
                                        id="photo-upload" 
                                        type="file" 
                                        className="hidden" 
                                        onChange={handleFileChange} 
                                        accept="image/*" 
                                        disabled={uploading}
                                    />
                                </label>
                            </div>
                        ) : (
                             <div className="w-32 h-32 rounded-full p-1 bg-gradient-to-tr from-blue-500 to-purple-500 mx-auto mb-6 shadow-2xl">
                                <img src={profile?.avatar || `https://ui-avatars.com/api/?name=${formData.name}&background=000&color=fff`} className="w-full h-full rounded-full object-cover bg-black" />
                            </div>
                        )}
                        
                        {editMode ? (
                            <div className="space-y-4 text-left animate-fade-in">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">FULL NAME</label>
                                    <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Full Name" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">PHONE</label>
                                    <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="Phone Number" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 ml-1">EMAIL</label>
                                    <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="Email Address" type="email" />
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-4">
                                    <Button variant="ghost" onClick={() => setEditMode(false)} disabled={saving}>Cancel</Button>
                                    <Button onClick={saveProfile} disabled={uploading || saving} isLoading={saving}>Save</Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h2 className="text-2xl font-bold text-white">{profile?.name}</h2>
                                <p className="text-gray-400 text-sm mb-1">{profile?.email}</p>
                                <p className="text-gray-500 text-xs mb-6">{profile?.phone || 'No phone number'}</p>
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="p-3 bg-white/5 rounded-xl">
                                        <p className="text-xs text-gray-500 uppercase font-bold">Total XP</p>
                                        <p className="text-xl font-bold text-blue-400">{totalScore * 10}</p>
                                    </div>
                                    <div className="p-3 bg-white/5 rounded-xl">
                                        <p className="text-xs text-gray-500 uppercase font-bold">Exams</p>
                                        <p className="text-xl font-bold text-white">{myResults.length}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setEditMode(true)} disabled={!isOnline}>Edit Profile</Button>
                            </>
                        )}
                    </div>
                </Card>
            </div>

            {/* Achievements */}
            <div className="lg:col-span-2 space-y-6">
                <h3 className="text-xl font-heading font-bold">Badges & Achievements</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {badges.map(b => (
                        <div key={b.id} className={`glass-card p-4 rounded-xl text-center border transition-all group ${b.unlocked ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/5 opacity-50 grayscale'}`}>
                            <div className={`mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${b.unlocked ? 'text-yellow-400 bg-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'text-gray-500 bg-white/5'}`}>
                                {b.icon}
                            </div>
                            <p className={`font-bold ${b.unlocked ? 'text-white' : 'text-gray-500'}`}>{b.name}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">{b.unlocked ? 'Unlocked' : 'Locked'}</p>
                        </div>
                    ))}
                </div>
                
                <Card title="Account Security">
                    <p className="text-sm text-gray-400 mb-4">Manage your account access and security settings.</p>
                    <div className="flex gap-4">
                         <Button variant="danger" size="sm" onClick={() => sendPasswordResetEmail(auth, profile?.email || '')
                            .then(() => alert("Password reset email sent!"))
                            .catch((err) => alert(err.message))
                         } disabled={!isOnline}>Reset Password</Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

// --- AUTH SCREEN ---
const AuthScreen = ({ showToast, isOnline }: { showToast: (m: string, t: 'success' | 'error') => void, isOnline: boolean }) => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isOnline) { showToast('You are offline. Cannot sign in.', 'error'); return; }
        setLoading(true);
        try {
            if (isSignUp) {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const newStudent: Student = {
                    id: userCredential.user.uid,
                    name: name || 'Student',
                    email: email,
                    phone: '',
                    status: 'active',
                    joinedAt: new Date().toLocaleDateString(),
                    isOnline: true
                };
                await set(ref(db, `students/${userCredential.user.uid}`), newStudent);
                showToast('Account created successfully!', 'success');
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                showToast('Welcome back!', 'success');
            }
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        if (!isOnline) { showToast('You are offline. Cannot sign in.', 'error'); return; }
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
            showToast('Successfully signed in!', 'success');
        } catch (error) {
            showToast('Google Sign-In failed.', 'error');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
            <div className="glass-panel w-full max-w-md p-10 rounded-3xl relative z-10 border border-white/10 shadow-2xl backdrop-blur-2xl">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-2xl mx-auto flex items-center justify-center text-3xl font-bold shadow-lg shadow-blue-500/30 mb-6">S</div>
                    <h1 className="text-3xl font-heading font-bold text-white">Student Portal</h1>
                    <p className="text-gray-400 mt-2 text-sm">Access your world of learning</p>
                </div>

                {!isOnline && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                        <WifiOff size={20} />
                        <div>
                            <span className="font-bold block">You are offline</span>
                            Please reconnect to sign in.
                        </div>
                    </div>
                )}

                <div className={`space-y-4 ${!isOnline ? 'opacity-50 pointer-events-none' : ''}`}>
                    <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 bg-white text-black font-bold py-3.5 rounded-xl hover:bg-gray-200 transition-colors">
                        <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5"/> Continue with Google
                    </button>

                    <div className="flex items-center my-6 text-xs text-gray-500 font-bold uppercase tracking-widest">
                        <div className="flex-grow border-t border-white/10"></div>
                        <span className="mx-4">Or use email</span>
                        <div className="flex-grow border-t border-white/10"></div>
                    </div>

                    <form onSubmit={handleAuthAction} className="space-y-4">
                        {isSignUp && (
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-400 ml-1">FULL NAME</label>
                                <Input placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} required={isSignUp} />
                            </div>
                        )}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 ml-1">EMAIL</label>
                            <Input placeholder="student@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 ml-1">PASSWORD</label>
                            <Input placeholder="••••••••" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                        </div>

                        <Button className="w-full py-4 text-base shadow-lg shadow-blue-900/20 mt-6" type="submit" isLoading={loading}>
                            {isSignUp ? 'Create Account' : 'Sign In'} <ChevronRight size={18} />
                        </Button>
                    </form>

                    <p className="text-center text-sm text-gray-400 mt-6">
                        {isSignUp ? 'Already have an account?' : "Don't have an account?"} 
                        <button onClick={() => setIsSignUp(!isSignUp)} className="text-blue-400 font-bold hover:text-blue-300 ml-2">
                            {isSignUp ? 'Sign In' : 'Sign Up'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- Nav Helper ---
const NavBtn = ({ icon, label, active, onClick }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all ${active ? 'text-blue-400' : 'text-gray-500'}`}>
        {React.cloneElement(icon, { size: active ? 22 : 18, strokeWidth: active ? 2.5 : 2 })}
        <span className="text-[10px] font-medium">{label}</span>
    </button>
);

const SidebarIcon = ({ icon, label, active, onClick }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 group w-full`}>
        <div className={`p-3 rounded-xl transition-all duration-300 ${active ? 'bg-gradient-to-tr from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30' : 'text-gray-500 group-hover:text-white group-hover:bg-white/5'}`}>
            {React.cloneElement(icon, { size: 22 })}
        </div>
        <span className={`text-[10px] font-bold tracking-wider transition-colors ${active ? 'text-white' : 'text-gray-600 group-hover:text-gray-400'}`}>{label}</span>
    </button>
);

const ToastContainer = ({ toasts }: { toasts: ToastMsg[] }) => (
    <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map(toast => (
            <div key={toast.id} className="animate-fade-in pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/10 text-sm font-medium bg-[#0a0a0e] text-white">
                {toast.type === 'error' ? <AlertOctagon className="text-red-500" size={18}/> : <CheckCircle className="text-green-500" size={18}/>}
                {toast.message}
            </div>
        ))}
    </div>
);

export default StudentApp;