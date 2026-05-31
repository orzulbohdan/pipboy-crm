import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { calculateLevelUp, XP_REWARDS, Difficulty } from '../lib/gameLogic';

export default function PipBoyCRM() {
  const [user, setUser] = useState<any>(null);
  const [quests, setQuests] = useState<any[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [loading, setLoading] = useState(false);
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
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      let { data, error } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
      if (error) {
        console.error("Ошибка загрузки профиля:", error);
        // Если профиля нет в таблице profiles, создаем его на лету
        const fallbackName = authUser.email ? authUser.email.split('@')[0] : 'Выживший';
        const { data: newProfile } = await supabase.from('profiles').insert([{ id: authUser.id, username: fallbackName, level: 1, experience: 0 }]).select().single();
        setUser(newProfile);
      } else {
        setUser(data);
      }
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
    setLoading(true);
    
    const cleanLogin = username.trim().toLowerCase();
    if (!cleanLogin) {
      alert('Логин не может быть пустым!');
      setLoading(false);
      return;
    }

    const virtualEmail = `${cleanLogin}@vault.tec`;
    console.log("Попытка входа для:", virtualEmail);

    if (isNewUser) {
      const { data, error } = await supabase.auth.signUp({ email: virtualEmail, password });
      setLoading(false);
      if (error) {
        alert(`Ошибка регистрации: ${error.message}`);
      } else {
        alert('Успешно! Теперь переключитесь в режим Входа.');
        setIsNewUser(false);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: virtualEmail, password });
      setLoading(false);
      if (error) {
        alert(`Ошибка авторизации: ${error.message}`);
      } else {
        console.log("Успешный вход, проверка пользователя...");
        await checkUser();
      }
    }
  }

  async function createQuest(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestTitle) return;
    
    await supabase.from('quests').insert([
      { title: newQuestTitle, description: newQuestDesc, difficulty: newQuestDiff, status: 'available' }
    ]);
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

    if (level > user.level) {
      alert(`⚡️ ПОВЫШЕНИЕ УРОВНЯ! Новый уровень: ${level}`);
    }

    checkUser();
    fetchQuests();
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col justify-center items-center p-4">
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50"></div>
        
        <div className="border border-green-500 p-6 w-full max-w-sm rounded-sm bg-zinc-900/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
          <h2 className="text-xl font-bold mb-4 text-center tracking-widest">
            {isNewUser ? 'РЕГИСТРАЦИЯ В ВОЛТ-ТЕК' : 'ВХОД В ПИП-БОЙ'}
          </h2>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-[10px] text-green-600 block mb-1">ЛОГИН ВЫЖИВШЕГО</label>
              <input 
                type="text" 
                placeholder="ИМЯ" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                className="w-full bg-black border border-green-700 p-2 text-green-500 focus:outline-none focus:border-green-400 placeholder-green-900" 
                required 
              />
            </div>
            
            <div>
              <label className="text-[10px] text-green-600 block mb-1">КОД ДОСТУПА</label>
              <input 
                type="password" 
                placeholder="ПАРОЛЬ" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full bg-black border border-green-700 p-2 text-green-500 focus:outline-none focus:border-green-400 placeholder-green-900" 
                required 
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-green-900/40 border border-green-500 p-2 font-bold hover:bg-green-500 hover:text-black transition-colors uppercase tracking-wider mt-2 disabled:opacity-50"
            >
              {loading ? 'УСТАНОВКА СВЯЗИ...' : isNewUser ? 'Создать терминал' : 'Авторизоваться'}
            </button>
          </form>
          
          <button 
            onClick={() => setIsNewUser(!isNewUser)} 
            className="w-full text-center text-xs mt-4 underline text-green-700 hover:text-green-500 block"
          >
            {isNewUser ? 'Уже есть аккаунт? Войти' : 'Новый выживший? Зарегистрироваться'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-500 font-mono p-4 pb-12 select-none relative overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50"></div>

      <div className="border border-green-500 p-4 mb-6 shadow-[0_0_15px_rgba(34,197,94,0.3)] bg-zinc-900/50 rounded-sm pt-[env(safe-area-inset-top)]">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-widest text-green-400">ПИП-БОЙ 3000</h1>
            <p className="text-xs text-green-600">ВЫЖИВШИЙ: {user.username.toUpperCase()}</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black">LVL {user.level}</span>
            <div className="w-32 bg-zinc-800 h-2 border border-green-500 mt-1 overflow-hidden">
              <div className="bg-green-500 h-full shadow-[0_0_8px_#22c55e]" style={{ width: `${Math.min((user.experience / (user.level * 100)) * 100, 100)}%` }}></div>
            </div>
            <p className="text-[10px] text-green-600 mt-0.5">{user.experience} / {user.level * 100} XP</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-[10px] text-red-500 mt-2 underline block hover:text-red-400">Покинуть убежище</button>
      </div>

      <details className="mb-6 border border-green-700 bg-zinc-950 rounded-sm p-2 text-sm">
        <summary className="cursor-pointer font-bold text-green-400 uppercase tracking-wider outline-none p-1"> 
          [+] Добавить Новое Задание
        </summary>
        <form onSubmit={createQuest} className="mt-3 space-y-3 p-1">
          <input type="text" placeholder="НАЗВАНИЕ КВЕСТА" value={newQuestTitle} onChange={e => setNewQuestTitle(e.target.value)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none focus:border-green-500 placeholder-green-800" required />
          <textarea placeholder="ОПИСАНИЕ ЗАДАЧИ" value={newQuestDesc} onChange={e => setNewQuestDesc(e.target.value)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none focus:border-green-500 placeholder-green-800" rows={2} />
          <select value={newQuestDiff} onChange={e => setNewQuestDiff(e.target.value as Difficulty)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none focus:border-green-500">
            <option value="easy">ЛЕГКО (+25 XP)</option>
            <option value="medium">СРЕДНЕ (+50 XP)</option>
            <option value="hard">СЛОЖНО (+100 XP)</option>
          </select>
          <button type="submit" className="w-full bg-green-900/30 border border-green-500 p-2 font-bold uppercase hover:bg-green-500 hover:text-black transition-colors">Раздать квест в пустошь</button>
        </form>
      </details>

      <h2 className="text-lg font-bold mb-4 tracking-wider text-green-400">🕹 ДОСТУПНЫЕ МИССИИ</h2>
      <div className="space-y-4">
        {quests.filter(q => q.status !== 'completed').map((quest) => (
          <div key={quest.id} className="border border-green-700 p-4 bg-zinc-950 rounded-sm hover:border-green-400 transition-colors">
            <div className="flex justify-between items-start gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex-1">
                <span className="inline-block border border-green-500 text-[10px] px-1.5 py-0.5 rounded-sm mb-2 text-green-400 font-bold uppercase">
                  {quest.difficulty} (+{XP_REWARDS[quest.difficulty as Difficulty]} XP)
                </span>
                <h3 className="text-md font-bold text-green-300 uppercase">{quest.title}</h3>
                {quest.description && <p className="text-sm text-green-600 mt-1 whitespace-pre-wrap">{quest.description}</p>}
              </div>
              <button onClick={() => completeQuest(quest.id, quest.difficulty)} className="w-full sm:w-auto bg-green-900/40 border border-green-500 text-green-400 text-xs px-4 py-2.5 uppercase tracking-wider font-bold hover:bg-green-500 hover:text-black transition-all">Выполнить</button>
            </div>
          </div>
        ))}
        {quests.filter(q => q.status !== 'completed').length === 0 && (
          <div className="border border-dashed border-green-900 p-8 text-center rounded-sm">
            <p className="text-green-800 italic">Пустошь безопасна. Все рейдеры повержены, задачи закрыты.</p>
          </div>
        )}
      </div>
    </div>
  );
}
