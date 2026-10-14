/* HobbyNest - Nono intelligent local assistant
 * No external AI/API key required.
 * Uses local intent matching + the existing Supabase client for live HobbyNest data.
 */
(() => {
  if (document.getElementById("nono-chatbot")) return;

  const path = window.location.pathname.toLowerCase();
  const isEducator = path.includes("/instructor/");
  const role = isEducator ? "educator" : "learner";
  const base = isEducator ? "../user/" : "./";

  const routes = {
    dashboard: base + (isEducator ? "../instructor/instructor-dashboard.html" : "user-dashboard.html"),
    explore: base + "explore.html",
    courses: base + "my-courses.html",
    schedule: base + "schedule.html",
    progress: base + "my-progress.html",
    saved: base + "saved.html",
    socials: base + "socials.html",
    meetups: base + "nearby-meetups.html",
    messages: base + "messages.html",
    profile: base + "profile.html",
    settings: base + "settings.html",
    educatorDashboard: "./instructor-dashboard.html",
    addClass: "./add-class.html",
    editClass: "./edit-class.html",
    lectures: "./recorded-lectures.html"
  };

  const actions = role === "educator" ? [
    { label: "🎓 My dashboard", message: "where is my dashboard", url: routes.educatorDashboard },
    { label: "➕ Create a class", message: "where can I create a class", url: routes.addClass },
    { label: "🎥 Recorded lectures", message: "where are recorded lectures", url: routes.lectures },
    { label: "📅 Sessions", message: "how do I schedule a session" },
    { label: "👥 My students", message: "show my students" },
    { label: "💬 Messages", message: "open messages", url: routes.messages },
    { label: "👤 My profile", message: "open my profile", url: routes.profile }
  ] : [
    { label: "🔎 Explore classes", message: "show me classes", url: routes.explore },
    { label: "📚 My courses", message: "show my courses", url: routes.courses },
    { label: "📈 My progress", message: "show my progress", url: routes.progress },
    { label: "📅 My schedule", message: "show my schedule", url: routes.schedule },
    { label: "💾 Saved", message: "show my saved courses", url: routes.saved },
    { label: "📍 Nearby meetups", message: "show nearby meetups", url: routes.meetups },
    { label: "💬 Messages", message: "open messages", url: routes.messages },
    { label: "👤 Profile", message: "open my profile", url: routes.profile }
  ];

  const style = document.createElement("style");
  style.textContent = `
    #nono-chatbot{position:fixed;right:22px;bottom:22px;z-index:99999;font-family:inherit;color:#25334b}
    #nono-toggle{border:0;border-radius:30px;padding:13px 19px;background:#507db8;color:#fff;cursor:pointer;font-size:15px;font-weight:600;box-shadow:0 6px 22px #253b5b30;transition:.2s}
    #nono-toggle:hover{background:#3f69a3;transform:translateY(-1px)}
    #nono-window{display:none;position:absolute;right:0;bottom:64px;width:min(380px,calc(100vw - 28px));height:520px;max-height:76vh;background:#fff;border:1px solid #e2e9f3;border-radius:20px;box-shadow:0 14px 45px #203b6028;overflow:hidden;flex-direction:column}
    #nono-window.nono-open{display:flex}
    .nono-header{background:linear-gradient(135deg,#507db8,#6f9edb);color:#fff;padding:15px 16px;display:flex;align-items:center;gap:11px}
    .nono-avatar{width:42px;height:42px;border-radius:50%;background:#ffffff32;display:grid;place-items:center;font-size:22px;flex:none}
    .nono-heading{flex:1}.nono-heading strong{display:block;font-size:16px}.nono-heading small{opacity:.9;font-size:12px}
    #nono-close{border:0;background:transparent;color:#fff;font-size:24px;cursor:pointer}.nono-clear{border:1px solid #ffffff55;border-radius:8px;background:#ffffff16;color:#fff;padding:6px 8px;font-size:11px;cursor:pointer}.nono-clear:hover{background:#ffffff2a}
    #nono-messages{flex:1;overflow-y:auto;padding:14px;background:#f8faff;scroll-behavior:smooth}
    .nono-message{margin:0 0 11px;display:flex}.nono-message span{max-width:90%;padding:10px 12px;border-radius:13px;font-size:13px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
    .nono-bot span{background:#fff;border:1px solid #e7edf6}.nono-user{justify-content:flex-end}.nono-user span{background:#507db8;color:#fff}
    .nono-typing span{color:#667894;font-style:italic}.nono-typing span::after{content:"";animation:nonoDots 1.1s infinite}.nono-link{display:inline-block;margin-top:7px;color:#345d96;font-weight:700;text-decoration:none;border:1px solid #d5e2f5;background:#f4f8ff;border-radius:10px;padding:6px 9px}.nono-link:hover{background:#e8f0ff}
    @keyframes nonoDots{0%{content:"."}33%{content:".."}66%{content:"..."}100%{content:"."}}
    #nono-actions{padding:9px 12px 3px;display:flex;gap:7px;flex-wrap:wrap;background:#fff;max-height:112px;overflow:auto}
    .nono-chip{border:1px solid #d5e2f5;background:#f4f8ff;color:#345d96;border-radius:18px;padding:7px 10px;cursor:pointer;font-size:12px}.nono-chip:hover{background:#e6efff}
    #nono-form{display:flex;padding:11px;gap:7px;border-top:1px solid #edf0f6;background:#fff;align-items:flex-end}#nono-input{min-width:0;flex:1;resize:none;max-height:100px;border:1px solid #dce4ef;border-radius:16px;padding:11px 13px;font:inherit;font-size:13px;outline:none;line-height:1.4}#nono-input:focus{border-color:#6f9edb}#nono-send{border:0;border-radius:50%;width:40px;height:40px;background:#507db8;color:#fff;cursor:pointer;font-size:18px}
    @media(max-width:480px){#nono-chatbot{right:12px;bottom:12px}#nono-window{height:min(520px,76vh)}}
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "nono-chatbot";
  root.innerHTML = `
    <section id="nono-window" role="dialog" aria-label="Nono chatbot">
      <header class="nono-header">
        <div class="nono-avatar">✨</div>
        <div class="nono-heading"><strong>Nono · HobbyNest</strong><small>${isEducator ? "Educator assistant" : "Learning companion"}</small></div>
        <button id="nono-clear" class="nono-clear" type="button">Clear chat</button><button id="nono-close" aria-label="Close chat" type="button">×</button>
      </header>
      <div id="nono-messages" aria-live="polite"></div>
      <div id="nono-actions"></div>
      <form id="nono-form">
        <textarea id="nono-input" rows="1" autocomplete="off" placeholder="Ask Nono anything..." aria-label="Your message"></textarea>
        <button id="nono-send" type="submit" aria-label="Send message">➤</button>
      </form>
    </section>
    <button id="nono-toggle" type="button" aria-expanded="false">✨ Ask Nono</button>
  `;
  document.body.appendChild(root);

  const chatWindow = root.querySelector("#nono-window");
  const toggle = root.querySelector("#nono-toggle");
  const close = root.querySelector("#nono-close");
  const clearChat = root.querySelector("#nono-clear");
  const messages = root.querySelector("#nono-messages");
  const chips = root.querySelector("#nono-actions");
  const form = root.querySelector("#nono-form");
  const input = root.querySelector("#nono-input");

  let lastIntent = null;
  let lastSearch = "";
  let currentUser = null;
  let profile = null;

  function getSupabaseClient(){
    try { if(window.supabaseClient) return window.supabaseClient; if(typeof supabaseClient !== "undefined") return supabaseClient; } catch(_){ }
    return null;
  }
  const client = getSupabaseClient();

  function addMessage(text, sender="bot", link=null){
    const row=document.createElement("div"); row.className=`nono-message nono-${sender}`;
    const bubble=document.createElement("span"); bubble.textContent=text;
    if(link){const anchor=document.createElement("a");anchor.className="nono-link";anchor.href=link.url;anchor.textContent=link.label;bubble.appendChild(document.createElement("br"));bubble.appendChild(anchor)}
    row.appendChild(bubble);messages.appendChild(row);messages.scrollTop=messages.scrollHeight;
  }

  function typing(){
    const row=document.createElement("div");row.className="nono-message nono-bot nono-typing";const bubble=document.createElement("span");bubble.textContent="Nono is thinking";row.appendChild(bubble);messages.appendChild(row);messages.scrollTop=messages.scrollHeight;return ()=>row.remove();
  }

  function setActions(items=actions){
    chips.replaceChildren();
    items.slice(0,8).forEach(action=>{const b=document.createElement("button");b.type="button";b.className="nono-chip";b.textContent=action.label;b.addEventListener("click",()=>{if(action.url){addMessage(action.label,"user");window.location.href=action.url}else handleMessage(action.message)});chips.appendChild(b)});
  }
  function openChat(){chatWindow.classList.add("nono-open");toggle.setAttribute("aria-expanded","true");setTimeout(()=>input.focus(),50)}
  function closeChat(){chatWindow.classList.remove("nono-open");toggle.setAttribute("aria-expanded","false")}
  toggle.addEventListener("click",()=>chatWindow.classList.contains("nono-open")?closeChat():openChat());
  close.addEventListener("click",closeChat);

  function normalize(text){return text.toLowerCase().replace(/\bu\b/g,"you").replace(/\bur\b/g,"your").replace(/[’']/g,"'").replace(/[^a-z0-9?\s]/g," ").replace(/\s+/g," ").trim()}
  function has(text, words){return words.some(w=>text.includes(w))}
  function go(key,label){addMessage(label||`Opening ${key}…`,"bot",{url:routes[key],label:`Open ${label||key} →`})}
  function currentPageName(){
    const file=(path.split("/").pop()||"").replace(".html","");
    const names={"user-dashboard":"Dashboard","explore":"Explore","my-courses":"My Learning","course":"Course","my-progress":"My Progress","schedule":"Schedule","saved":"Saved","socials":"Socials","nearby-meetups":"Nearby Meetups","messages":"Messages","profile":"Profile","settings":"Settings","instructor-dashboard":"Educator Dashboard","add-class":"Add Class","edit-class":"Edit Class","recorded-lectures":"Recorded Lectures"};
    return names[file]||"HobbyNest";
  }

  async function loadUser(){
    if(currentUser) return currentUser;
    if(!client) return null;
    try{
      const {data,error}=await client.auth.getUser();
      if(error) return null;
      currentUser=data?.user||null;
      if(currentUser){const p=await client.from("profiles").select("id,full_name,email,role,bio").eq("id",currentUser.id).maybeSingle();profile=p.data||null}
      return currentUser;
    }catch(_){return null}
  }

  const stopWords=new Set(["search","find","show","me","some","available","recommend","recommended","list","class","classes","course","courses","learn","learning","explore","hobby","hobbies","skill","skills","please","can","you","could","would","like","want","need","for","the","a","an","to","in","of","on","with","my","is","are","any","near","nearby","from","what","where","how","do","i","we","there","give","tell","about"]);
  function searchTerms(text){
    return (text.match(/[a-z0-9]+/g)||[]).filter(w=>w.length>2&&!stopWords.has(w)).slice(0,5);
  }

  async function searchCourses(text){
    if(!client){addMessage("Course search needs the Supabase connection. You can still open Explore to browse classes.","bot",{url:routes.explore,label:"Open Explore →"});return}
    const words=searchTerms(text);lastSearch=words.join(" ");lastIntent="search";
    const done=typing();
    let q=client.from("courses").select("id,title,category,level,duration,description").eq("published",true).order("created_at",{ascending:false}).limit(6);
    if(words.length) q=q.or(words.map(w=>`title.ilike.%${w}%,category.ilike.%${w}%,description.ilike.%${w}%`).join(","));
    const {data,error}=await q;done();
    if(error){console.error("Nono course search",error);addMessage("I couldn't load classes right now. Try Explore and I'll still help you find your way around.","bot",{url:routes.explore,label:"Open Explore →"});return}
    if(!data?.length){addMessage(words.length?`I couldn't find a published class matching “${words.join(" ")}”. Try another skill or browse all classes.`:"There aren't any published classes to show yet.","bot",{url:routes.explore,label:"Browse all classes →"});setActions([{label:"🔎 Try another search",message:"show me classes"},{label:"🏠 Dashboard",message:"open dashboard",url:routes.dashboard}]);return}
    addMessage(words.length?`I found ${data.length} ${data.length===1?"class":"classes"} matching “${words.join(" ")}”:`:`Here are ${data.length} available classes:`);
    data.forEach(c=>addMessage(`${c.title}${c.category?` · ${c.category}`:""}${c.level?` · ${c.level}`:""}${c.duration?` · ${c.duration}`:""}`,"bot",{url:base+`course.html?id=${encodeURIComponent(c.id)}`,label:"View class →"}));
    setActions([{label:"🔎 Search another skill",message:"find another class"},{label:"📚 My courses",message:"show my courses",url:routes.courses},{label:"🏠 Explore",message:"open explore",url:routes.explore}]);
  }

  async function myCourses(){
    lastIntent="courses";
    const user=await loadUser();if(!user){addMessage("Please log in first, then I can show your enrolled courses.");return}
    if(!client){go("courses","My courses");return}
    const done=typing();
    const {data,error}=await client.from("enrollments").select("course_id,enrolled_at").eq("learner_id",user.id).order("enrolled_at",{ascending:false}).limit(10); 
    if(error){done();addMessage("I couldn't load your courses right now. You can open My Learning directly.","bot",{url:routes.courses,label:"Open My Learning →"});return}
    if(!data?.length){done();addMessage("You aren't enrolled in a course yet. Want me to help you find one?");setActions([{label:"🔎 Explore classes",message:"show me classes",url:routes.explore},{label:"📍 Meetups",message:"show nearby meetups",url:routes.meetups}]);return}
    const ids=data.map(x=>x.course_id);const r=await client.from("courses").select("id,title,category,level").in("id",ids);done();
    const map=new Map((r.data||[]).map(c=>[c.id,c]));addMessage(`You have ${data.length} enrolled ${data.length===1?"course":"courses"}:`);
    data.forEach(e=>{const c=map.get(e.course_id);if(c)addMessage(`${c.title}${c.category?` · ${c.category}`:""}`,"bot",{url:base+`course.html?id=${c.id}`,label:"Open course →"})});
    setActions([{label:"📈 My progress",message:"show my progress",url:routes.progress},{label:"📅 Schedule",message:"show my schedule",url:routes.schedule}]);
  }

  async function savedCourses(){
    lastIntent="saved";
    const user=await loadUser();if(!user){addMessage("Please log in first, then I can show your saved courses.");return}
    if(!client){go("saved","Saved");return}
    const done=typing();const {data,error}=await client.from("saved_courses").select("course_id").eq("learner_id",user.id).limit(10);if(error){done();addMessage("I couldn't load your saved courses right now.","bot",{url:routes.saved,label:"Open Saved →"});return}
    if(!data?.length){done();addMessage("You don't have any saved courses yet. I can help you find something to save!", "bot",{url:routes.explore,label:"Explore classes →"});return}
    const r=await client.from("courses").select("id,title,category").in("id",data.map(x=>x.course_id));done();addMessage(`You have ${r.data?.length||0} saved ${r.data?.length===1?"course":"courses"}:`);(r.data||[]).forEach(c=>addMessage(`${c.title}${c.category?` · ${c.category}`:""}`,"bot",{url:base+`course.html?id=${c.id}`,label:"Open course →"}));
  }

  async function progress(){
    lastIntent="progress";
    const user=await loadUser();if(!user){addMessage("Please log in first, then I can check your progress.");return}
    if(!client){go("progress","My Progress");return}
    const done=typing();const e=await client.from("enrollments").select("course_id").eq("learner_id",user.id);if(e.error){done();addMessage("I couldn't read your progress right now.","bot",{url:routes.progress,label:"Open My Progress →"});return}
    const ids=(e.data||[]).map(x=>x.course_id);if(!ids.length){done();addMessage("You haven't enrolled in a course yet, so there isn't progress to calculate. Start with Explore.","bot",{url:routes.explore,label:"Explore classes →"});return}
    const l=await client.from("lessons").select("id,course_id").in("course_id",ids);const p=await client.from("progress").select("lesson_id,completed").eq("learner_id",user.id).eq("completed",true);done();
    const completed=new Set((p.data||[]).map(x=>x.lesson_id));const lessons=l.data||[];const total=lessons.length;const finished=lessons.filter(x=>completed.has(x.id)).length;const percent=total?Math.round(finished/total*100):0;
    addMessage(`Across your enrolled courses, you've completed ${finished} of ${total} lessons (${percent}%). ${percent===100?"Amazing — you're all caught up! 🎉":percent>=70?"You're making great progress! 💙":"Keep going — every completed lesson counts! ✨"}`,"bot",{url:routes.progress,label:"Open My Progress →"});
    setActions([{label:"📚 My courses",message:"show my courses"},{label:"📅 Schedule",message:"show my schedule"},{label:"🔎 Find another class",message:"show me classes"}]);
  }

  async function schedule(){
    lastIntent="schedule";
    const user=await loadUser();if(!user){addMessage("Please log in first, then I can check your schedule.");return}
    if(!client){go("schedule","Schedule");return}
    const done=typing();let rows=[];
    if(isEducator){const r=await client.from("sessions").select("id,title,session_date,meeting_link,course_id").eq("educator_id",user.id).gte("session_date",new Date().toISOString()).order("session_date",{ascending:true}).limit(8);rows=r.data||[]}
    else {const e=await client.from("enrollments").select("course_id").eq("learner_id",user.id);const ids=(e.data||[]).map(x=>x.course_id);if(ids.length){const r=await client.from("sessions").select("id,title,session_date,meeting_link,course_id").in("course_id",ids).gte("session_date",new Date().toISOString()).order("session_date",{ascending:true}).limit(8);rows=r.data||[]}}
    done();if(!rows.length){addMessage(isEducator?"You don't have any upcoming sessions yet.":"You don't have any upcoming sessions from your enrolled courses yet.","bot",{url:routes.schedule,label:"Open Schedule →"});return}
    addMessage(`You have ${rows.length} upcoming ${rows.length===1?"session":"sessions"}:`);rows.forEach(s=>{const d=new Date(s.session_date);addMessage(`${s.title} · ${d.toLocaleString([], {dateStyle:"medium",timeStyle:"short"})}`,"bot",s.meeting_link?{url:s.meeting_link,label:"Open meeting →"}:null)});
  }

  async function meetups(){
    lastIntent="meetups";
    if(!client){go("meetups","Nearby Meetups");return}
    const done=typing();const r=await client.from("meetups").select("id,title,category,venue,starts_at,capacity").gte("starts_at",new Date().toISOString()).order("starts_at",{ascending:true}).limit(6);done();
    if(r.error||!r.data?.length){addMessage("I couldn't find any upcoming meetups right now. You can open Nearby Meetups to browse or host one.","bot",{url:routes.meetups,label:"Open Nearby Meetups →"});return}
    addMessage(`I found ${r.data.length} upcoming ${r.data.length===1?"meetup":"meetups"}:`);r.data.forEach(m=>addMessage(`${m.title}${m.category?` · ${m.category}`:""}${m.venue?` · ${m.venue}`:""} · ${new Date(m.starts_at).toLocaleString([], {dateStyle:"medium",timeStyle:"short"})}`,"bot",{url:routes.meetups,label:"View meetups →"}));
  }

  async function educatorStudents(){
    const user=await loadUser();if(!user){addMessage("Please log in first, then I can check your educator data.");return}
    const done=typing();const c=await client.from("courses").select("id,title").eq("educator_id",user.id);const ids=(c.data||[]).map(x=>x.id);if(!ids.length){done();addMessage("You haven't created a class yet. You can start from Add Class.","bot",{url:routes.addClass,label:"Create a class →"});return}
    const e=await client.from("enrollments").select("learner_id,course_id").in("course_id",ids);const learnerIds=[...new Set((e.data||[]).map(x=>x.learner_id))];done();
    addMessage(`Your ${c.data.length} ${c.data.length===1?"class":"classes"} currently have ${learnerIds.length} unique enrolled ${learnerIds.length===1?"learner":"learners"}.`,"bot",{url:routes.educatorDashboard,label:"Open educator dashboard →"});
  }

  async function educatorStats(){
    const user=await loadUser();if(!user){addMessage("Please log in first, then I can check your educator statistics.");return}
    const done=typing();const c=await client.from("courses").select("id,title,published").eq("educator_id",user.id);const ids=(c.data||[]).map(x=>x.id);let learners=0,lectures=0;
    if(ids.length){const e=await client.from("enrollments").select("learner_id").in("course_id",ids);learners=new Set((e.data||[]).map(x=>x.learner_id)).size;const l=await client.from("course_lectures").select("id").in("course_id",ids);lectures=l.data?.length||0}
    done();addMessage(`Your educator overview: ${c.data?.length||0} classes, ${(c.data||[]).filter(x=>x.published).length} published, ${lectures} recorded lectures and ${learners} unique learners.`,"bot",{url:routes.educatorDashboard,label:"Open dashboard →"});
  }

  function explain(feature){
    const info={
      explore:"Explore is where you discover published classes. You can search by a hobby, skill or course name, then open a class to see its details.",
      courses:"My Learning shows the classes you've enrolled in, so you can jump back into your learning.",
      progress:"My Progress shows lesson completion and your overall learning progress.",
      saved:"Saved keeps the classes you've bookmarked so you can return to them later.",
      schedule:"Schedule shows upcoming learning sessions connected to your courses. Educators can also use it to manage sessions.",
      socials:"Socials is the community area where users can share hobby-related posts, like posts and leave comments.",
      meetups:"Nearby Meetups helps you discover hobby workshops and get-togethers. Users can join available meetups, and eligible users can host them.",
      messages:"Messages is HobbyNest's communication area for conversations allowed by the platform.",
      profile:"Profile is where you can view and update your public account information.",
      settings:"Settings contains account and preference controls, including password-related options.",
      dashboard:isEducator?"Your educator dashboard is your home for managing classes, learners, lectures and teaching activity.":"Your dashboard is your HobbyNest home. It gives you quick access to learning, progress, schedule and community features."
    };
    addMessage(info[feature]||"I can guide you around HobbyNest and open the right page for you.");
  }

  function showCapabilities(){
    if(isEducator){addMessage("I can help you with:\n• Find/open HobbyNest pages\n• Create and manage classes\n• Recorded lectures\n• Students and enrollment counts\n• Sessions and schedules\n• Messages, profile and settings\n• Upcoming meetups\n• General HobbyNest questions\n\nTry: “where do I add a class?”, “how many students do I have?”, or “what can you do?”");}
    else{addMessage("I can help you with:\n• Find classes by hobby or skill\n• Show your enrolled courses\n• Check learning progress\n• Show saved courses\n• Check upcoming sessions\n• Find nearby/upcoming meetups\n• Open any HobbyNest page\n• Explain how a feature works\n• Help with profile, settings and messages\n\nTry: “find photography classes”, “show my progress”, “where are my saved courses?”, or “what can you do?”");}
    setActions();
  }

  function navigationIntent(text){
    const map=[
      ["dashboard",["dashboard","home page","home"]],
      ["explore",["explore","browse classes","find classes","classes page","course page"]],
      ["courses",["my courses","my learning","enrolled courses","enrolled classes","my classes"]],
      ["progress",["progress","learning progress","completed lessons"]],
      ["schedule",["schedule","calendar","upcoming sessions","my sessions"]],
      ["saved",["saved","bookmarks","bookmarked","favorites","favourites"]],
      ["socials",["social","socials","posts","community"]],
      ["meetups",["meetup","meetups","nearby","workshop","workshops","get together","events"]],
      ["messages",["message","messages","chat with","conversation"]],
      ["profile",["profile","my account"]],
      ["settings",["settings","preferences","password settings"]]
    ];
    return map.find(([key,words])=>has(text,words))?.[0]||null;
  }

  async function handleMessage(raw){
    const message=raw.trim();if(!message)return;addMessage(message,"user");const text=normalize(message);
    const finish=typing();await new Promise(r=>setTimeout(r,120));finish();

    if(has(text,["hi","hello","hey","hii","good morning","good evening","good afternoon"])){
      addMessage(`Hey${profile?.full_name?` ${profile.full_name.split(" ")[0]}`:""}! 💙 I'm Nono. You're on ${currentPageName()}. Ask me “what can you do?”, “show me where my courses are”, or ask me to find a class.`);setActions();return;
    }
    if(has(text,["what can you do","what do you do","help me","help","options","menu","capabilities","how can you help"])) {showCapabilities();return}
    if(has(text,["thank","thanks","thank you"])) {addMessage("You're very welcome! ✨ Keep learning, creating and exploring.");setActions();return}
    if(has(text,["who are you","what are you","what is nono"])) {addMessage("I'm Nono, HobbyNest's built-in assistant. I don't need an external AI key — I use HobbyNest's own data and navigation to help you find things, answer common questions and open the right page.");setActions();return}

    // Direct navigation: “show me where…”, “where can I find…”, “take me to…”
    const nav=navigationIntent(text);
    if(nav && (has(text,["where","open","take me","show me","find","go to","bring me","page","section"])||text===nav||text.includes("my "))){
      if(nav==="explore" && has(text,["find","search","show me"])){await searchCourses(text);return}
      if(nav==="courses" && !isEducator){await myCourses();return}
      if(nav==="saved" && !isEducator){await savedCourses();return}
      if(nav==="progress" && !isEducator){await progress();return}
      if(nav==="schedule"){await schedule();return}
      if(nav==="meetups"){await meetups();return}
      explain(nav);go(nav,nav==="courses"?"My Learning":nav.charAt(0).toUpperCase()+nav.slice(1));return;
    }

    if(has(text,["find","search","recommend","recommend me","show me","available classes","available courses","what classes can i","what courses can i","what can i learn"]) && !has(text,["my courses","my progress","my saved"])) {await searchCourses(text);return}
    if(has(text,["guitar","piano","keyboard","ukulele","dance","bollywood","salsa","hip hop","watercolor","watercolour","sketch","painting","acrylic","crochet","origami","embroidery","photography","photo","camera","python","javascript","html","coding","programming","sign language","language","fitness","cooking","writing","design","music"])) {await searchCourses(text);return}

    // Learner live data
    if(!isEducator && has(text,["my courses","what am i enrolled","what did i enroll","enrolled in","joined classes","my learning"])) {await myCourses();return}
    if(!isEducator && has(text,["my progress","how much have i completed","how much did i complete","completion","completed lessons","learning progress","streak"])) {await progress();return}
    if(!isEducator && has(text,["saved courses","my saved","saved classes","bookmarked courses","favorites","favourites"])) {await savedCourses();return}
    if(has(text,["upcoming","schedule","sessions","session","calendar","tomorrow","next class","next session"])) {await schedule();return}
    if(has(text,["nearby meetup","nearby meetups","meetups near","meetups","workshop","workshops","get together","events"])) {await meetups();return}

    // Educator live data
    if(isEducator && has(text,["how many students","number of students","my students","students do i have","learners do i have","enrolled students"])) {await educatorStudents();return}
    if(isEducator && has(text,["my classes","my courses","classes do i have","published classes","how many classes","educator stats","statistics","analytics"])) {await educatorStats();return}
    if(isEducator && has(text,["create a class","add a class","new class","where do i add a class"])) {addMessage("You can create a new class from the educator Add Class page. Add the course details there, then you can manage lessons and publish the class.","bot",{url:routes.addClass,label:"Open Add Class →"});return}
    if(isEducator && has(text,["recorded lecture","recorded lectures","add lecture","upload lecture"])) {addMessage("Recorded lectures are managed from the educator Recorded Lectures page. You can add lecture details and associate them with your course.","bot",{url:routes.lectures,label:"Open Recorded Lectures →"});return}
    if(isEducator && has(text,["schedule a session","create session","add session","schedule session"])) {addMessage("To schedule a learning session, use your educator dashboard/session controls. Add the session title, course, date/time and meeting link, then save it.","bot",{url:routes.educatorDashboard,label:"Open educator dashboard →"});return}

    // Feature explanations
    if(has(text,["how does explore work","what is explore","what can i do on explore"])) {explain("explore");go("explore","Explore");return}
    if(has(text,["how does progress work","what is progress"])) {explain("progress");go("progress","My Progress");return}
    if(has(text,["how do saved courses work","what is saved"])) {explain("saved");go("saved","Saved");return}
    if(has(text,["what are meetups","how do meetups work","what is a meetup"])) {explain("meetups");go("meetups","Nearby Meetups");return}
    if(has(text,["how does messaging work","who can i message","how do messages work"])) {explain("messages");go("messages","Messages");return}
    if(has(text,["edit profile","change my profile","change password","account settings"])) {explain(has(text,["password","settings"])?"settings":"profile");go(has(text,["password","settings"])?"settings":"profile",has(text,["password","settings"])?"Settings":"Profile");return}

    if(has(text,["logout","log out","sign out","signout"])) {addMessage("You can securely sign out using the Log out option in your dashboard navigation.");return}
    if(has(text,["what is hobbynest","about hobbynest","what is this platform"])) {addMessage("HobbyNest is a learning and community platform built around the idea of learning beyond the syllabus. Learners can discover classes, track progress and join community activities, while educators can create and manage classes.");setActions();return}
    if(has(text,["how do i enroll","how can i enroll","join a course","join a class"])) {addMessage("Open Explore, choose a published class, view its details and use the enrollment option available on the course page.","bot",{url:routes.explore,label:"Open Explore →"});return}
    if(has(text,["how do i save","save a course","bookmark a course"])) {addMessage("Open a class you like and use its save/bookmark option. Your saved classes can then be found under Saved.","bot",{url:routes.saved,label:"Open Saved →"});return}
    if(has(text,["how do i review","review a course","rate a course","give a rating"])) {addMessage("After enrolling in a course, you can use the course's review/rating area to leave feedback. Ratings use a 1–5 star scale.");return}
    if(has(text,["how do i host a meetup","create a meetup","host a meetup"])) {addMessage("Use Nearby Meetups to create a meetup when the host controls are available to your account. Add the title, category, venue, timing and capacity.","bot",{url:routes.meetups,label:"Open Nearby Meetups →"});return}
    if(has(text,["how do i message","message my educator","contact educator"])) {addMessage("Open Messages to view conversations allowed by HobbyNest. Course pages may also provide a contextual way to contact an educator.","bot",{url:routes.messages,label:"Open Messages →"});return}

    // Follow-up questions based on the last action.
    if(lastIntent==="search" && has(text,["yes","yeah","more","another","more like this"])) {await searchCourses(lastSearch||"classes");return}
    if(has(text,["yes","okay","ok","sure"]) && lastIntent){addMessage("Sure! You can choose one of the options below, or tell me exactly what you want to find.");setActions();return}

    addMessage("I can help with HobbyNest itself, even without an external AI key. Try asking me something specific, like:\n• “What can you do?”\n• “Show me where my courses are.”\n• “Find photography classes.”\n• “How much progress have I made?”\n• “Where are my saved courses?”\n• “What sessions do I have?”\n• “Show nearby meetups.”\n• “How do I enroll?”");setActions();
  }

  clearChat.addEventListener("click", () => {
    messages.replaceChildren();
    addMessage(`Hi! I'm Nono, your ${isEducator ? "educator" : "learning"} companion. What would you like help with?`);
    setActions();
    input.focus();
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });
  form.addEventListener("submit",e=>{e.preventDefault();const value=input.value.trim();input.value="";input.style.height="auto";if(value)handleMessage(value)});
  addMessage(`Hi! 👋 I'm Nono, your ${isEducator?"educator":"learning"} assistant. You're currently on ${currentPageName()}. Ask me “what can you do?” or “show me where my courses are.”`);
  setActions();
})();
