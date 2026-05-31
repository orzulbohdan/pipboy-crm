import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { calculateLevelUp, XP_REWARDS, Difficulty } from '../lib/gameLogic';

export default function PipBoyCRM() {
  const [user, setUser] = useState<any>(null);
  const [quests, setQuests] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [newQuestTitle, setNewQuestTitle] = useState('');
  const [newQuestDesc, setNewQuestDesc] = useState('');
  const [newQuestDiff, setNewQuestDiff] = useState<Difficulty>('medium');

  useEffect(() => {
    checkUser();
    fetchQuests();
    
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      checkUser();
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      let { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setUser(data);
    } else {
      setUser(null);
    }
  }

  async function fetchQuests() {
    let { data } = await supabase.from('quests').select('*').order('created_at', { ascending: false });
    if (data) setQuests(data);
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (isNewUser) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) alert(error.message);
      else alert('Доступ в Убежище разрешен! Войдите под своими данными.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
  }

  async function createQuest(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestTitle) return;
    await supabase.from('quests').insert([{ title: newQuestTitle, description: newQuestDesc, difficulty: newQuestDiff, status: 'available' }]);
    setNewQuestTitle('');
    setNewQuestDesc('');
    fetchQuests();
  }

  async function completeQuest(questId: number, difficulty: Difficulty) {
    if (!user) return;
    const xpGained = XP_REWARDS[difficulty];
    const totalXp = user.experience + xpGained;
    const { level, remainingXp } = calculateLevelUp(totalXp, user.level);

    await supabase.from('quests').update({ status: 'completed', assigned_to: user.id }).eq('id', questId);
    await supabase.from('profiles').update({ experience: remainingXp, level: level }).eq('id', user.id);

    checkUser();
    fetchQuests();
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col justify-center items-center p-4">
        <div className="border border-green-500 p-6 w-full max-w-sm rounded-sm bg-zinc-900/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
          <h2 className="text-xl font-bold mb-4 text-center tracking-widest">{isNewUser ? 'РЕГИСТРАЦИЯ В ВОЛТ-ТЕК' : 'ВХОД В ПИП-БОЙ'}</h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="email" placeholder="EMAIL" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-black border border-green-700 p-2 text-green-500 focus:outline-none focus:border-green-400 placeholder-green-800" required />
            <input type="password" placeholder="ПАРОЛЬ" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-black border border-green-700 p-2 text-green-500 focus:outline-none focus:border-green-400 placeholder-green-800" required />
            <button type="submit" className="w-full bg-green-900/40 border border-green-500 p-2 font-bold hover:bg-green-500 hover:text-black transition-colors uppercase tracking-wider">{isNewUser ? 'Создать терминал' : 'Авторизоваться'}</button>
          </form>
          <button onClick={() => setIsNewUser(!isNewUser)} className="w-full text-center text-xs mt-4 underline text-green-700 hover:text-green-500">{isNewUser ? 'Уже есть аккаунт? Войти' : 'Новый выживший? Зарегистрироваться'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-500 font-mono p-4 pb-12 select-none relative overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50"></div>

      {/* Профиль Игрока */}
      <div className="border border-green-500 p-4 mb-6 shadow-[0_0_15px_rgba(34,197,94,0.3)] bg-zinc-900/50 rounded-sm pt-[env(safe-area-inset-top)]">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-widest text-green-400">ПИП-БОЙ 3000</h1>
            <p className="text-xs text-green-600">ВЫЖИВШИЙ: {user.username.toUpperCase()}</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black">LVL {user.level}</span>
            <div className="w-32 bg-zinc-800 h-2 border border-green-500 mt-1 overflow-hidden">
              <div className="bg-green-500 h-full shadow-[0_0_8px_#22c55e]" style={{ width: `${(user.experience / (user.level * 100)) * 100}%` }}></div>
            </div>
            <p className="text-[10px] text-green-600 mt-0.5">{user.experience} / {user.level * 100} XP</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-[10px] text-red-500 mt-2 underline block">Покинуть убежище</button>
      </div>

      {/* Создание Квеста */}
      <details className="mb-6 border border-green-700 bg-zinc-950 rounded-sm p-2 text-sm">
        <summary className="cursor-pointer font-bold text-green-400 uppercase tracking-wider"> [+] Добавить Новое Задание</summary>
        <form onSubmit={createQuest} className="mt-3 space-y-3">
          <input type="text" placeholder="НАЗВАНИЕ КВЕСТА" value={newQuestTitle} onChange={e => setNewQuestTitle(e.target.value)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none placeholder-green-800" required />
          <textarea placeholder="ОПИСАНИЕ ЗАДАЧИ" value={newQuestDesc} onChange={e => setNewQuestDesc(e.target.value)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none placeholder-green-800" rows={2} />
          <select value={newQuestDiff} onChange={e => setNewQuestDiff(e.target.value as Difficulty)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none">
            <option value="easy">Легко (+25 XP)</option>
            <option value="medium">Средне (+50 XP)</option>
            <option value="hard">Сложно (+100 XP)</option>
          </select>
          <button type="submit" className="w-full bg-green-900/30 border border-green-500 p-2 font-bold uppercase hover:bg-green-500 hover:text-black transition-colors">Раздать квест в пустошь</button>
        </form>
      </details>

      {/* Список квестов */}
      <h2 className="text-lg font-bold mb-4 tracking-wider">🕹 АКТИВНЫЕ ЗАДАНИЯ</h2>
      <div className="space-y-4">
        {quests.filter(q => q.status !== 'completed').map((quest) => (
          <div key={quest.id} className="border border-green-700 p-4 bg-zinc-950 rounded-sm hover:border-green-400 transition-colors">
            <div className="flex justify-between items-start gap-4">
              <div>
                <span className="inline-block border border-green-500 text-[10px] px-1.5 py-0.5 rounded-sm mb-2 text-green-400 font-bold uppercase">
                  {quest.difficulty} (+{XP_REWARDS[quest.difficulty as Difficulty]} XP)
                </span>
                <h3 className="text-md font-bold text-green-300">{quest.title}</h3>
                {quest.description && <p className="text-sm text-green-600 mt-1">{quest.description}</p>}
              </div>
              <button onClick={() => completeQuest(quest.id, quest.difficulty)} className="bg-green-900/40 border border-green-500 text-green-400 text-xs px-3 py-2 uppercase tracking-wider font-bold hover:bg-green-500 hover:text-black transition-all">Выполнить</button>
            </div>
          </div>
        ))}
        {quests.filter(q => q.status !== 'completed').length === 0 && (
          <p className="text-green-800 italic text-center py-6">Вокруг тишина. Все рейдеры повержены, задачи закрыты.</p>
        )}
      </div>
    </div>
  );
}