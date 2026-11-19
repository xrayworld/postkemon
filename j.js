const frame_borders= document.getElementById('frame_borders');
const pokelogs= document.getElementById('pokelogs');
// ADDED: Grab references to the existing HTML scenes, root container, and #score button
const web= document.getElementById('web');
const scene_room= document.querySelector('.scene_room');
const scene_stage= document.querySelector('.scene_stage');
const score_btn= document.getElementById('score');

// ADDED: Firebase Realtime Database endpoints (single postkemon.json split into 0=users, 1=scores) & PokéAPI (first 250)
const DB_BASE= 'https://postkemon-default-rtdb.europe-west1.firebasedatabase.app';
const DB_USERS_URL= DB_BASE + '/postkemon/0.json';
const DB_SCORES_URL= DB_BASE + '/postkemon/1.json';
const POKEAPI_250_URL= 'https://pokeapi.co/api/v2/pokemon?limit=250';

// ADDED: LocalStorage keys for user session (expires on logout or Monday 00:00)
const LS_USER_KEY= 'postkemon_user';
const LS_EXPIRY_KEY= 'postkemon_monday_expiry';

// ADDED: Runtime game state variables
let active_username= null;
let game_timer_id= null;
let game_seconds= 0;
let game_frozen= false;
let board_locked= false;
let first_card= null;
let second_card= null;
let matched_pairs= 0;
let total_pairs= 0;
let total_cards_in_play= 0;

for( let i=0;i<4;i++ ){ frame_borders.insertAdjacentHTML('beforeend', '<span class="frame_border frame_border_'+(i+1)+'"></span>'); }

const create_pokelog= function( id,h2,button,error )
{
   const pokelog= document.createElement('div');
   pokelog.id= id;
   pokelog.classList.add('pokelog');

   const pokelog_parts= [];
   for( let i=0;i<4;i++ )
   {
      pokelog_parts[i]= document.createElement('span');
      pokelog_parts[i].classList.add('pokelog_part','pokelog_part_'+(i+1));
   }
   const pokelog_h2 = document.createElement('h2');
   pokelog_h2.classList.add('pokelog_part','pokelog_h2');
   const pokelog_input= document.createElement('input');
   pokelog_input.classList.add('pokelog_part','pokelog_input');
   pokelog_input.setAttribute('type','text');
   pokelog_input.setAttribute('placeholder','Write the username');
   const pokelog_flash= document.createElement('p');
   pokelog_flash.classList.add('pokelog_part','pokeflash');

   pokelog_parts[3].textContent= button;
   pokelog_h2.textContent= h2;
   pokelog_flash.textContent= error;

   pokelog.append(pokelog_h2,pokelog_input,...pokelog_parts,pokelog_flash);

   pokelog.start= pokelog_parts[2];
   pokelog.input= pokelog_input;
   pokelog.flash= pokelog_flash;

   return pokelog;
};

const pokelog_1= create_pokelog('pokelog_1','SIGN UP','Play','The username already exists');
const pokelog_2= create_pokelog('pokelog_2','LOG IN','Start','The username does not exists');
pokelogs.append(pokelog_1, pokelog_2);


// ============================================================================
// ADDED: HELPER TO RE-TRIGGER .pokerror ANIMATION EVERY TIME AN ERROR HAPPENS
// ============================================================================
function trigger_pokerror(pokelog_el)
{
   pokelog_el.classList.remove('pokerror');
   void pokelog_el.offsetWidth; // Forces browser reflow so @keyframes pokerror replays
   pokelog_el.classList.add('pokerror');
}


// ============================================================================
// ADDED: SESSION STORAGE HELPERS (LOCALSTORAGE + MONDAY 00:00 EXPIRATION)
// ============================================================================
function get_next_monday_ms()
{
   const now= new Date();
   let days_left= (8 - now.getDay()) % 7;
   if( days_left===0 ){ days_left= 7; }
   const next_monday= new Date(now.getFullYear(), now.getMonth(), now.getDate() + days_left, 0, 0, 0, 0);
   return next_monday.getTime();
}

function save_user_session(username)
{
   active_username= username;
   localStorage.setItem(LS_USER_KEY, username);
   localStorage.setItem(LS_EXPIRY_KEY, String(get_next_monday_ms()));
}

function get_valid_session_user()
{
   const saved_user= localStorage.getItem(LS_USER_KEY);
   const saved_expiry= localStorage.getItem(LS_EXPIRY_KEY);
   if( !saved_user || !saved_expiry ){ return null; }
   if( Date.now() >= Number(saved_expiry) )
   {
      localStorage.removeItem(LS_USER_KEY);
      localStorage.removeItem(LS_EXPIRY_KEY);
      return null;
   }
   return saved_user;
}

function clear_user_session()
{
   stop_game_timer();
   active_username= null;
   localStorage.removeItem(LS_USER_KEY);
   localStorage.removeItem(LS_EXPIRY_KEY);
   scoreboard.close();
   scene_stage.innerHTML= '';
   // Restore the two pokelogs in case pokeready cleared them
   pokelogs.innerHTML= '';
   pokelog_1.input.value= '';
   pokelog_2.input.value= '';
   pokelog_1.classList.remove('pokerror');
   pokelog_2.classList.remove('pokerror');
   pokelogs.append(pokelog_1, pokelog_2);
   scene_room.classList.remove('scene_hidden');
}


// ============================================================================
// ADDED: FIREBASE HTTP REQUESTS (GET & POST FOR USERS, GET/POST/PUT FOR SCORES)
// ============================================================================
async function fetch_db_users()
{
   const res= await fetch(DB_USERS_URL);
   const data= await res.json();
   if( !data ){ return []; }
   return Object.values(data);
}

async function username_exists_in_db(username)
{
   const users= await fetch_db_users();
   for( let i=0; i<users.length; i++ )
   {
      if( users[i] && users[i].username === username ){ return true; }
   }
   return false;
}

async function register_user_in_db(username)
{
   const payload= new Object();
   payload.username= username;
   payload.createdAt= new Date().toISOString();

   const opts= new Object();
   opts.method= 'POST';
   opts.body= JSON.stringify(payload);
   await fetch(DB_USERS_URL, opts);
}

function sort_scores(a, b)
{
   // Primary sort: more cards first; Secondary sort: faster time first
   if( b.cards !== a.cards ){ return b.cards - a.cards; }
   return a.time - b.time;
}

async function fetch_db_scores()
{
   const res= await fetch(DB_SCORES_URL);
   const data= await res.json();
   if( !data ){ return []; }
   const list= Object.values(data);
   list.sort(sort_scores);
   return list;
}

async function save_score_in_db(username, time_sec, cards_count)
{
   const record= new Object();
   record.username= username;
   record.time= time_sec;
   record.cards= cards_count;
   record.savedAt= new Date().toISOString();

   // 1. POST new score to Firebase
   const post_opts= new Object();
   post_opts.method= 'POST';
   post_opts.body= JSON.stringify(record);
   await fetch(DB_SCORES_URL, post_opts);

   // 2. Keep only Top 30 scores so the database never saturates
   const all_scores= await fetch_db_scores();
   const top_30= all_scores.slice(0, 30);

   const put_opts= new Object();
   put_opts.method= 'PUT';
   put_opts.body= JSON.stringify(top_30);
   await fetch(DB_SCORES_URL, put_opts);

   return top_30;
}


// ============================================================================
// ADDED: SCOREBOARD JAVASCRIPT COMPONENT (CREATED VIA JS & LINKED TO #score)
// ============================================================================
const create_scoreboard= function()
{
   const panel= document.createElement('section');
   panel.id= 'scoreboard_panel';

   const header= document.createElement('div');
   header.classList.add('score_header');

   const title= document.createElement('h2');
   title.textContent= 'POSTKEMON SCOREBOARD';

   const actions= document.createElement('div');
   actions.classList.add('hud_group');

   const play_again_btn= document.createElement('button');
   play_again_btn.classList.add('hud_btn');
   play_again_btn.textContent= 'Play Again';

   const close_btn= document.createElement('button');
   close_btn.classList.add('hud_btn');
   close_btn.textContent= 'Close';

   actions.append(play_again_btn, close_btn);
   header.append(title, actions);

   const table_wrap= document.createElement('div');
   table_wrap.classList.add('score_table_wrap');

   const table= document.createElement('table');
   table.classList.add('score_table');
   table.innerHTML= '<thead><tr><th>#</th><th>Trainer</th><th>Cards</th><th>Time</th><th>Date</th></tr></thead>';

   const tbody= document.createElement('tbody');
   table.append(tbody);
   table_wrap.append(table);
   panel.append(header, table_wrap);
   web.append(panel);

   panel.render= function(list)
   {
      tbody.innerHTML= '';
      if( list.length===0 )
      {
         tbody.innerHTML= '<tr><td colspan="5">No scores recorded yet.</td></tr>';
         return;
      }
      for( let i=0; i<list.length; i++ )
      {
         const item= list[i];
         const tr= document.createElement('tr');
         if( active_username && item.username === active_username ){ tr.classList.add('score_me'); }
         const mins= Math.floor(item.time / 60);
         const secs= item.time % 60;
         const date_str= item.savedAt ? item.savedAt.slice(0, 16).replace('T', ' ') : '-';
         tr.innerHTML= '<td>'+(i+1)+'</td><td>'+item.username+'</td><td>'+item.cards+'</td><td>'+mins+'m '+secs+'s</td><td>'+date_str+'</td>';
         tbody.append(tr);
      }
   };

   panel.open= async function(custom_title, preloaded_list)
   {
      title.textContent= custom_title || 'POSTKEMON SCOREBOARD';
      panel.classList.add('score_open');
      play_again_btn.style.display= active_username ? 'inline-block' : 'none';
      if( preloaded_list )
      {
         panel.render(preloaded_list);
      }
      else
      {
         tbody.innerHTML= '<tr><td colspan="5">Loading scores...</td></tr>';
         try
         {
            const scores= await fetch_db_scores();
            panel.render(scores);
         }
         catch(err)
         {
            tbody.innerHTML= '<tr><td colspan="5">Error loading Firebase scores.</td></tr>';
         }
      }
   };

   panel.close= function()
   {
      panel.classList.remove('score_open');
   };

   close_btn.addEventListener('click', function()
   {
      panel.close();
   });

   play_again_btn.addEventListener('click', function()
   {
      panel.close();
      if( active_username ){ start_stage_game(); }
   });

   return panel;
};

const scoreboard= create_scoreboard();

// ADDED: Wire existing #score button to toggle the JS scoreboard component
score_btn.addEventListener('click', function()
{
   if( scoreboard.classList.contains('score_open') )
   {
      scoreboard.close();
   }
   else
   {
      scoreboard.open();
   }
});


// ============================================================================
// MODIFIED: pokeready() FIXED SO THE 1-SECOND INITIAL DELAY IS REMOVED
// ============================================================================
function pokeready(on_countdown_done)
{
   const pokeready_el= document.createElement('p');
   pokeready_el.id= 'pokeready';
   let count_number= 3;
   const count_colors= ['#ee1515','#1c57e7','#fdc101'];
   const count_fontsizes= ['64px','128px','256px'];

   // MODIFIED: Extract one countdown step into a function so we can call it immediately (0ms delay)
   function tick_countdown()
   {
      if( count_number===0 )
      {
         clearInterval(count_engine);
         pokeready_el.remove();
         on_countdown_done();
         return;
      }
      pokeready_el.textContent= count_number;
      pokelogs.innerHTML= '';
      pokelogs.append(pokeready_el);

      pokeready_el.style.color= count_colors[count_number-1];
      pokeready_el.style.fontSize= count_fontsizes[count_number-1];
      count_number--;
   }

   tick_countdown(); // ADDED: Runs immediately so "3" appears with zero delay
   const count_engine= setInterval(tick_countdown, 1000); // MODIFIED: Continues every 1s after first tick
}


// ============================================================================
// ADDED: GAME TIMER, DYNAMIC MONITOR CARD COUNT, POKEAPI FETCH & 3D CARD ENGINE
// ============================================================================
function format_time(sec)
{
   const m= Math.floor(sec / 60);
   const s= sec % 60;
   return m + 'm ' + s + 's';
}

function stop_game_timer()
{
   if( game_timer_id !== null )
   {
      clearInterval(game_timer_id);
      game_timer_id= null;
   }
}

function start_game_timer()
{
   stop_game_timer();
   game_seconds= 0;
   game_frozen= false;
   const timer_el= document.getElementById('stage_timer');
   if( timer_el )
   {
      timer_el.classList.remove('timer_frozen');
      timer_el.textContent= 'Time: 0m 0s';
   }
   game_timer_id= setInterval(function()
   {
      // Expire automatically if Monday 00:00 passes mid-game
      if( !get_valid_session_user() )
      {
         clear_user_session();
         return;
      }
      if( game_frozen ){ return; }
      game_seconds++;
      const el= document.getElementById('stage_timer');
      if( el ){ el.textContent= 'Time: ' + format_time(game_seconds); }
   }, 1000);
}

// ADDED: Calculates how many paired cards fit inside the current monitor size without overflow
function calculate_screen_grid(board_el)
{
   const gap= 10;
   const avail_w= board_el.clientWidth;
   const avail_h= board_el.clientHeight;
   const target_w= window.innerWidth < 769 ? 74 : 105;
   const target_h= window.innerWidth < 769 ? 98 : 138;

   let cols= Math.max(2, Math.floor((avail_w + gap) / (target_w + gap)));
   let rows= Math.max(2, Math.floor((avail_h + gap) / (target_h + gap)));

   // Ensure an even number of cards (pairs) capped at 48 cards (24 pairs)
   let count= cols * rows;
   if( count > 48 )
   {
      if( avail_w >= avail_h ){ cols= 8; rows= 6; }
      else { cols= 6; rows= 8; }
      count= 48;
   }
   else if( count % 2 !== 0 )
   {
      count= count - 1;
   }
   if( count < 4 ){ cols= 2; rows= 2; count= 4; }

   // Compute exact card pixel size that fits cleanly with 3:4 card ratio
   const max_card_w= Math.floor((avail_w - (cols - 1) * gap) / cols);
   const max_card_h= Math.floor((avail_h - (rows - 1) * gap) / rows);
   let card_w= Math.min(max_card_w, Math.floor(max_card_h * 0.75));
   let card_h= Math.floor(card_w * 1.33);
   if( card_h > max_card_h )
   {
      card_h= max_card_h;
      card_w= Math.floor(card_h * 0.75);
   }

   const grid= new Object();
   grid.cols= cols;
   grid.rows= rows;
   grid.total_cards= count;
   grid.card_w= card_w;
   grid.card_h= card_h;
   return grid;
}

// ADDED: Fetches exclusively from the first 250 Pokémon and builds a shuffled paired deck
async function fetch_shuffled_pokemon_cards(cards_count)
{
   const pairs_needed= cards_count / 2;
   const res= await fetch(POKEAPI_250_URL);
   const json= await res.json();
   const pool= json.results;

   const picked= [];
   while( picked.length < pairs_needed )
   {
      const rand= Math.floor(Math.random() * 250);
      if( picked.indexOf(rand) === -1 ){ picked.push(rand); }
   }

   const deck= [];
   for( let i=0; i<picked.length; i++ )
   {
      const poke_id= picked[i] + 1;
      const poke_img= 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/' + poke_id + '.png';

      const c1= new Object();
      c1.id= poke_id;
      c1.name= pool[picked[i]].name;
      c1.img= poke_img;

      const c2= new Object();
      c2.id= poke_id;
      c2.name= pool[picked[i]].name;
      c2.img= poke_img;

      deck.push(c1, c2);
   }

   // Fisher-Yates shuffle
   for( let i=deck.length - 1; i>0; i-- )
   {
      const j= Math.floor(Math.random() * (i + 1));
      const tmp= deck[i];
      deck[i]= deck[j];
      deck[j]= tmp;
   }
   return deck;
}

// ADDED: Creates a 3D card (<div> with 2 <span>s) and handles pair matching + 1.5s freeze
function create_3d_card(card_data, w, h)
{
   const card= document.createElement('div');
   card.classList.add('card_3d');
   card.style.width= w + 'px';
   card.style.height= h + 'px';
   card.setAttribute('data-id', String(card_data.id));

   const back= document.createElement('span');
   back.classList.add('card_face', 'card_back');

   const front= document.createElement('span');
   front.classList.add('card_face', 'card_front');
   front.style.backgroundImage= 'url(\'' + card_data.img + '\')';

   card.append(back, front);

   card.addEventListener('click', function()
   {
      if( board_locked ){ return; }
      if( card.classList.contains('card_flipped') || card.classList.contains('card_matched') ){ return; }

      card.classList.add('card_flipped');

      if( first_card === null )
      {
         first_card= card;
         return;
      }

      second_card= card;
      board_locked= true;

      if( first_card.getAttribute('data-id') === second_card.getAttribute('data-id') )
      {
         first_card.classList.add('card_matched');
         second_card.classList.add('card_matched');
         first_card= null;
         second_card= null;
         matched_pairs++;
         board_locked= false;

         if( matched_pairs === total_pairs )
         {
            finish_game();
         }
      }
      else
      {
         // Freeze timer for 1.5s on mismatch, then flip back down
         game_frozen= true;
         const timer_el= document.getElementById('stage_timer');
         if( timer_el ){ timer_el.classList.add('timer_frozen'); }

         setTimeout(function()
         {
            if( first_card ){ first_card.classList.remove('card_flipped'); }
            if( second_card ){ second_card.classList.remove('card_flipped'); }
            first_card= null;
            second_card= null;
            game_frozen= false;
            board_locked= false;
            if( timer_el ){ timer_el.classList.remove('timer_frozen'); }
         }, 1500);
      }
   });

   return card;
}

// ADDED: Saves score to Firebase when game finishes and triggers #score button
async function finish_game()
{
   stop_game_timer();
   try
   {
      const updated_top= await save_score_in_db(active_username, game_seconds, total_cards_in_play);
      // Trigger #score button behavior and show victory header with saved list
      if( !scoreboard.classList.contains('score_open') )
      {
         score_btn.click();
      }
      scoreboard.open('VICTORY! ' + total_cards_in_play + ' CARDS IN ' + format_time(game_seconds), updated_top);
   }
   catch(err)
   {
      score_btn.click();
   }
}

// ADDED: Hides .scene_room, builds .scene_stage HUD & cards that fit the screen, and starts the timer
async function start_stage_game()
{
   scene_room.classList.add('scene_hidden');
   stop_game_timer();
   scene_stage.innerHTML= '';

   // Build HUD inside .scene_stage
   const hud= document.createElement('div');
   hud.id= 'stage_hud';

   const info_group= document.createElement('div');
   info_group.classList.add('hud_group');
   info_group.innerHTML= '<span>Trainer: ' + active_username + '</span><span id="stage_cards_info">Cards: ...</span><span id="stage_timer">Time: 0m 0s</span>';

   const btn_group= document.createElement('div');
   btn_group.classList.add('hud_group');

   const restart_btn= document.createElement('button');
   restart_btn.classList.add('hud_btn');
   restart_btn.textContent= 'Restart';
   restart_btn.addEventListener('click', function(){ start_stage_game(); });

   const logout_btn= document.createElement('button');
   logout_btn.classList.add('hud_btn');
   logout_btn.textContent= 'Logout';
   logout_btn.addEventListener('click', function(){ clear_user_session(); });

   btn_group.append(restart_btn, logout_btn);
   hud.append(info_group, btn_group);

   const board= document.createElement('div');
   board.id= 'stage_board';
   board.textContent= 'Loading Pokémon...';

   scene_stage.append(hud, board);

   // Measure screen space and calculate exact paired card count
   const grid= calculate_screen_grid(board);
   total_cards_in_play= grid.total_cards;
   total_pairs= grid.total_cards / 2;
   matched_pairs= 0;
   first_card= null;
   second_card= null;
   board_locked= true;

   document.getElementById('stage_cards_info').textContent= 'Cards: ' + total_cards_in_play;
   board.style.gridTemplateColumns= 'repeat(' + grid.cols + ', ' + grid.card_w + 'px)';

   const deck= await fetch_shuffled_pokemon_cards(total_cards_in_play);
   board.innerHTML= '';

   for( let i=0; i<deck.length; i++ )
   {
      board.append(create_3d_card(deck[i], grid.card_w, grid.card_h));
   }

   board_locked= false;
   start_game_timer();
}


// ============================================================================
// MODIFIED: SIGN UP (pokelog_1) & ADDED: LOG IN (pokelog_2) EVENT LISTENERS
// ============================================================================
pokelog_1.start.addEventListener('click', async function()
{
   // ADDED: Read username, validate it does NOT exist in Firebase, else trigger .pokerror
   const username= pokelog_1.input.value.trim().toLowerCase();
   if( !username )
   {
      trigger_pokerror(pokelog_1);
      return;
   }

   try
   {
      const exists= await username_exists_in_db(username);
      if( exists )
      {
         trigger_pokerror(pokelog_1);
         return;
      }

      await register_user_in_db(username);
      save_user_session(username);

      // MODIFIED: Launch countdown immediately, then hide .scene_room & start .scene_stage
      pokeready(function()
      {
         start_stage_game();
      });
   }
   catch(err)
   {
      trigger_pokerror(pokelog_1);
   }
});

// ADDED: LOG IN listener — username MUST exist in Firebase, else trigger .pokerror
pokelog_2.start.addEventListener('click', async function()
{
   const username= pokelog_2.input.value.trim().toLowerCase();
   if( !username )
   {
      trigger_pokerror(pokelog_2);
      return;
   }

   try
   {
      const exists= await username_exists_in_db(username);
      if( !exists )
      {
         trigger_pokerror(pokelog_2);
         return;
      }

      save_user_session(username);

      pokeready(function()
      {
         start_stage_game();
      });
   }
   catch(err)
   {
      trigger_pokerror(pokelog_2);
   }
});

// ADDED: Auto-resume session if a valid username is already saved in localStorage (before Monday 00:00)
const saved_session_user= get_valid_session_user();
if( saved_session_user )
{
   active_username= saved_session_user;
   start_stage_game();
}