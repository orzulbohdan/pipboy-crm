import { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabaseClient';
import { calculateLevelUp, XP_REWARDS, Difficulty } from '../lib/gameLogic';

export default function PipBoyCRM() {
  const [user, setUser] = useState<any>(null);
  const [quests, setQuests] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Поля нового квеста
  const [newQuestTitle, setNewQuestTitle] = useState('');
  const [newQuestDesc, setNewQuestDesc] = useState('');
  const [newQuestDiff, setNewQuestDiff] = useState<Difficulty>('medium');
  const [questType, setQuestType] = useState<'solo' | 'coop2' | 'coop3'>('solo');

  useEffect(() => {
    checkUser();
    refreshAllData();
    
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      checkUser();
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  async function refreshAllData() {
    fetchQuests();
    fetchLeaderboard();
    fetchLogs();
    fetchAllProfiles();
  }

  async function checkUser() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      let { data, error } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
      const fallbackName = authUser.email ? authUser.email.split('@')[0] : 'ВЫЖИВШИЙ';
      
      if (error || !data) {
        const { data: newProfile } = await supabase.from('profiles').insert([
          { id: authUser.id, username: fallbackName, level: 1, experience: 0 }
        ]).select().single();
        setUser(newProfile);
      } else {
        if (!data.username) data.username = fallbackName;
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

  async function fetchLeaderboard() {
    let { data } = await supabase.from('profiles').select('*').order('level', { ascending: false }).order('experience', { ascending: false });
    if (data) setLeaderboard(data);
  }

  async function fetchLogs() {
    let { data } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(15);
    if (data) setLogs(data);
  }

  async function fetchAllProfiles() {
    let { data } = await supabase.from('profiles').select('id, username');
    if (data) setAllProfiles(data);
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

    if (isNewUser) {
      const { error } = await supabase.auth.signUp({ email: virtualEmail, password });
      setLoading(false);
      if (error) alert(`Ошибка регистрации: ${error.message}`);
      else {
        alert('Успешно! Теперь войдите.');
        setIsNewUser(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: virtualEmail, password });
      setLoading(false);
      if (error) alert(`Ошибка авторизации: ${error.message}`);
      else {
        await checkUser();
        refreshAllData();
      }
    }
  }

  async function createQuest(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestTitle) return;
    
    // Определяем участников команды (пока пустой массив, заполнится при принятии квеста)
    await supabase.from('quests').insert([
      { 
        title: newQuestTitle, 
        description: newQuestDesc, 
        difficulty: newQuestDiff, 
        status: 'available',
        team_members: questType === 'solo' ? null : [] 
      }
    ]);
    setNewQuestTitle('');
    setNewQuestDesc('');
    setQuestType('solo');
    fetchQuests();
  }

  async function acceptQuest(questId: number, currentTeam: any) {
    if (!user) return;

    if (currentTeam === null) {
      // Одиночный квест
      await supabase.from('quests').update({
        status: 'in_progress',
        accepted_by: user.id,
        accepted_at: new Date().toISOString()
      }).eq('id', questId);
    } else {
      // Групповой квест: добавляем себя первым участником
      await supabase.from('quests').update({
        status: 'in_progress',
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
        team_members: [user.id]
      }).eq('id', questId);
    }
    refreshAllData();
  }

  async function joinTeamQuest(questId: number, currentTeam: string[]) {
    if (!user || !currentTeam) return;
    if (currentTeam.includes(user.id)) return;

    const updatedTeam = [...currentTeam, user.id];
    await supabase.from('quests').update({ team_members: updatedTeam }).eq('id', questId);
    refreshAllData();
  }

  async function completeQuest(quest.any) {
    if (!user) return;
    
    const difficulty = quest.difficulty as Difficulty;
    const baseXp = XP_REWARDS[difficulty];
    
    // Считаем количество участников для деления опыта
    let participants: string[] = [];
    if (quest.team_members === null) {
      participants = [quest.accepted_by || user.id];
    } else {
      participants = quest.team_members.length > 0 ? quest.team_members : [quest.accepted_by || user.id];
    }
    
    const xpPerPerson = Math.round(baseXp / participants.length);

    // 1. Помечаем квест выполненным
    await supabase.from('quests').update({ status: 'completed' }).eq('id', quest.id);

    // 2. Раздаем опыт всем участникам рейда на сервере
    for (const participantId of participants) {
      let { data: pProfile } = await supabase.from('profiles').select('*').eq('id', participantId).single();
      if (pProfile) {
        const totalXp = pProfile.experience + xpPerPerson;
        const { level, remainingXp } = calculateLevelUp(totalXp, pProfile.level);
        await supabase.from('profiles').update({ experience: remainingXp, level: level }).eq('id', participantId);
      }
    }

    // 3. Создаем записи в Логе активности для каждого участника
    const runners = allProfiles.filter(p => participants.includes(p.id)).map(p => p.username.toUpperCase());
    const logName = runners.length > 0 ? runners.join(' + ') : user.username.toUpperCase();
    
    await supabase.from('activity_log').insert([
      { 
        username: logName, 
        quest_title: quest.title.toUpperCase(), 
        xp_gained: xpPerPerson 
      }
    ]);

    alert(`🏁 Миссия завершена! Начислено по +${xpPerPerson} XP каждому участнику.`);
    refreshAllData();
  }

  const displayUsername = user && user.username ? String(user.username).toUpperCase() : 'ВЫЖИВШИЙ';

  // Вспомогательная функция для поиска имен напарников по ID
  function getTeamNames(ids: string[]) {
    if (!ids || ids.length === 0) return 'Ищет напарников...';
    return allProfiles
      .filter(p => ids.includes(p.id))
      .map(p => p.username.toUpperCase())
      .join(', ');
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col justify-center items-center p-4">
        <Head><link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" /></Head>
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50"></div>
        <div className="border border-green-500 p-6 w-full max-w-sm rounded-sm bg-zinc-900/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
          <h2 className="text-xl font-bold mb-4 text-center tracking-widest">{isNewUser ? 'РЕГИСТРАЦИЯ В ВОЛТ-ТЕК' : 'ВХОД В ПИП-БОЙ'}</h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="text" placeholder="ЛОГИН ИМЯ" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-black border border-green-700 p-2 text-green-500 focus:outline-none focus:border-green-400 placeholder-green-900" required />
            <input type="password" placeholder="КОД ДОСТУПА" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-black border border-green-700 p-2 text-green-500 focus:outline-none focus:border-green-400 placeholder-green-900" required />
            <button type="submit" disabled={loading} className="w-full bg-green-900 border border-green-500 p-2 font-bold hover:bg-green-500 hover:text-black transition-colors uppercase mt-2 disabled:opacity-50">
              {loading ? 'СВЯЗЬ...' : isNewUser ? 'Создать терминал' : 'Авторизоваться'}
            </button>
          </form>
          <button onClick={() => setIsNewUser(!isNewUser)} className="w-full text-center text-xs mt-4 underline text-green-700 hover:text-green-500 block">
            {isNewUser ? 'Уже есть аккаунт? Войти' : 'Новый выживший? Регистрация'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-500 font-mono p-4 pb-12 select-none relative overflow-x-hidden">
      <Head><link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" /></Head>
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50"></div>

      {/* ШАПКА ХАРАКТЕРИСТИК */}
      <div className="border border-green-500 p-4 mb-6 bg-zinc-900 rounded-sm">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-widest text-green-400">ПИП-БОЙ 3000</h1>
            <p className="text-xs text-green-600">ВЫЖИВШИЙ: {displayUsername}</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black">LVL {user.level || 1}</span>
            <div className="w-32 bg-zinc-800 h-2 border border-green-500 mt-1 overflow-hidden">
              <div className="bg-green-500 h-full" style={{ width: `${Math.min(((user.experience || 0) / ((user.level || 1) * 100)) * 100, 100)}%` }}></div>
            </div>
            <p className="text-[10px] text-green-600 mt-0.5">{user.experience || 0} / {(user.level || 1) * 100} XP</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-xs text-red-500 mt-2 underline block hover:text-red-400">Покинуть убежище</button>
      </div>

      {/* ДОБАВЛЕНИЕ КВЕСТА */}
      <details className="mb-6 border border-green-700 bg-zinc-900 rounded-sm p-3 text-sm">
        <summary className="cursor-pointer font-bold text-green-400 uppercase tracking-wider outline-none">[+] Развернуть пульт управления миссиями</summary>
        <form onSubmit={createQuest} className="mt-3 space-y-3">
          <input type="text" placeholder="НАЗВАНИЕ КВЕСТА" value={newQuestTitle} onChange={e => setNewQuestTitle(e.target.value)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none placeholder-green-800" required />
          <textarea placeholder="ОПИСАНИЕ ЗАДАЧИ" value={newQuestDesc} onChange={e => setNewQuestDesc(e.target.value)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none placeholder-green-800" rows={2} />
          
          <div className="flex gap-4 flex-wrap sm:flex-nowrap">
            <select value={newQuestDiff} onChange={e => setNewQuestDiff(e.target.value as Difficulty)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none">
              <option value="easy">ЛЕГКО (+25 XP)</option>
              <option value="medium">СРЕДНЕ (+50 XP)</option>
              <option value="hard">СЛОЖНО (+100 XP)</option>
            </select>
            <select value={questType} onChange={e => setQuestType(e.target.value as any)} className="w-full bg-black border border-green-800 p-2 text-green-500 focus:outline-none">
              <option value="solo">🙋‍♂️ ОДИНОЧНЫЙ КВЕСТ</option>
              <option value="coop2">👥 РЕЙД НА ДВОИХ (XP ПОПОЛАМ)</option>
              <option value="coop3">☣️ РЕЙД НА ТРОИХ (XP НА 3-ИХ)</option>
            </select>
          </div>
          
          <button type="submit" className="w-full bg-green-900 border border-green-500 p-2 font-bold uppercase hover:bg-green-500 hover:text-black transition-colors">Выдать задачу в пустошь</button>
        </form>
      </details>

      {/* СПИСОК МИССИЙ */}
      <h2 className="text-lg font-bold mb-4 tracking-wider text-green-400">🕹️ ДОСТУПНЫЕ КОНТРАКТЫ</h2>
      <div className="space-y-4 mb-8">
        {quests.filter(q => q.status !== 'completed').map((quest) => {
          const isSolo = quest.team_members === null;
          const maxTeamSize = quest.difficulty === 'coop2' || quest.team_members ? (quest.team_members && quest.difficulty === 'coop3' ? 3 : 2) : 1;
          const currentTeamSize = quest.team_members ? quest.team_members.length : 0;
          
          const isAssignedToMe = quest.accepted_by === user.id || (quest.team_members && quest.team_members.includes(user.id));
          const isFull = quest.team_members && quest.team_members.length >= (quest.difficulty === 'coop2' ? 2 : 3);

          return (
            <div key={quest.id} className={`border p-4 bg-zinc-900 rounded-sm transition-colors ${isAssignedToMe ? 'border-green-400 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'border-green-800'}`}>
              <div className="flex justify-between items-start gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex-1">
                  <div className="flex gap-2 mb-2 flex-wrap">
                    <span className="border border-green-500 text-[10px] px-1.5 py-0.5 rounded-sm text-green-400 font-bold uppercase">
                      {quest.difficulty} (+{XP_REWARDS[quest.difficulty as Difficulty]} XP)
                    </span>
                    <span className="border border-green-600 text-[10px] px-1.5 py-0.5 rounded-sm text-green-500 font-bold uppercase">
                      {isSolo ? '🙋‍♂️ ОДИНОЧНЫЙ' : `👥 КОМАНДНЫЙ РЕЙД`}
                    </span>
                  </div>
                  
                  <h3 className="text-md font-bold text-green-300 uppercase">{quest.title}</h3>
                  {quest.description && <p className="text-sm text-green-600 mt-1 whitespace-pre-wrap">{quest.description}</p>}
                  
                  {/* Статус выполнения на карточке */}
                  {quest.status === 'in_progress' && (
                    <div className="text-[11px] mt-2 text-yellow-500 border-t border-zinc-800 pt-2 font-mono">
                      {isSolo ? (
                        <span>⚠️ ВЫПОЛНЯЕТ: {allProfiles.find(p => p.id === quest.accepted_by)?.username?.toUpperCase() || 'ВЫЖИВШИЙ'}</span>
                      ) : (
                        <span>⚔️ ОТРЯД В РЕЙДЕ: {getTeamNames(quest.team_members)}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="w-full sm:w-auto flex flex-col gap-2">
                  {quest.status === 'available' && (
                    <button onClick={() => acceptQuest(quest.id, quest.team_members)} className="w-full bg-green-900/30 border border-green-600 text-green-400 text-xs px-4 py-2 uppercase font-bold hover:bg-green-500 hover:text-black transition-all">
                      Взять квест
                    </button>
                  )}

                  {quest.status === 'in_progress' && !isSolo && !isFull && !quest.team_members.includes(user.id) && (
                    <button onClick={() => joinTeamQuest(quest.id, quest.team_members)} className="w-full bg-yellow-900/40 border border-yellow-500 text-yellow-400 text-xs px-4 py-2 uppercase font-bold hover:bg-yellow-500 hover:text-black transition-all">
                      [+] Вступить в рейд
                    </button>
                  )}

                  {quest.status === 'in_progress' && isAssignedToMe && (
                    <button onClick={() => completeQuest(quest)} className="w-full bg-green-900 border border-green-400 text-white text-xs px-4 py-2.5 uppercase font-bold hover:bg-green-500 hover:text-black transition-all shadow-[0_0_8px_#22c55e]">
                      Сдать задание
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {quests.filter(q => q.status !== 'completed').length === 0 && (
          <div className="border border-dashed border-green-900 p-8 text-center rounded-sm">
            <p className="text-green-800 italic">Сводка пуста. Задач в пустоши не обнаружено.</p>
          </div>
        )}
      </div>

      {/* ТАБЛИЦА ЛИДЕРОВ */}
      <h2 className="text-lg font-bold mb-4 tracking-wider text-green-400">🏆 ЗАЛ СЛАВЫ УБЕЖИЩА</h2>
      <div className="border border-green-700 bg-zinc-900 rounded-sm p-4 mb-8">
        <div className="w-full text-xs space-y-2">
          <div className="flex justify-between font-bold text-green-600 border-b border-green-900 pb-2 uppercase text-[10px]">
            <div className="w-12 text-center">ПОЗ</div>
            <div className="flex-1 pl-2">ВЫЖИВШИЙ</div>
            <div className="w-16 text-center">УРОВЕНЬ</div>
            <div className="w-20 text-right">ОПЫТ</div>
          </div>
          {leaderboard.map((player, index) => {
            const isMe = user && player.id === user.id;
            return (
              <div key={player.id} className={`flex justify-between items-center py-2 border-b border-zinc-800/40 text-sm ${isMe ? 'bg-green-900/20 text-green-300 font-bold border-l-2 border-green-500 pl-1' : 'text-green-500'}`}>
                <div className="w-12 text-center text-xs font-bold text-green-600">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</div>
                <div className="flex-1 pl-2 truncate uppercase">{player.username || 'Неизвестный'} {isMe && <span className="text-[10px] text-green-600 font-normal">(ВЫ)</span>}</div>
                <div className="w-16 text-center font-black">{player.level || 1}</div>
                <div className="w-20 text-right text-xs text-green-600">{player.experience || 0} XP</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ЛОГ ДЕЙСТВИЙ (ХРОНИКИ ПУСТОШИ) */}
      <h2 className="text-lg font-bold mb-4 tracking-wider text-green-400">📜 ХРОНИКИ АКТИВНОСТИ УБЕЖИЩА</h2>
      <div className="border border-green-800 bg-black rounded-sm p-3 font-mono text-xs shadow-inner h-48 overflow-y-auto space-y-2 border-t-2">
        {logs.map((log) => (
          <div key={log.id} className="text-green-500 leading-relaxed border-b border-zinc-900/60 pb-1.5">
            <span className="text-green-700">[{new Date(log.created_at).toLocaleTimeString()}]</span>{' '}
            <span className="text-green-400 font-bold">{log.username}</span>{' '}
            <span className="text-zinc-500">успешно выполнил контракт</span>{' '}
            <span className="text-green-300 font-semibold">"{log.quest_title}"</span>{' '}
            <span className="text-yellow-600 font-bold">+{log.xp_gained} XP</span>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="text-green-900 italic text-center pt-16">Архивы пусты. Записей о подвигах пока нет.</p>
        )}
      </div>

    </div>
  );
}
