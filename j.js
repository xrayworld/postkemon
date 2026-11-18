const frame_borders= document.getElementById('frame_borders');
const pokelogs= document.getElementById('pokelogs');

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








function pokeready(scene_stage)
{
   const pokeready= document.createElement('p');
   pokeready.id= 'pokeready';
   let count_number= 3;
   let count_colors= ['#ee1515','#1c57e7','#fdc101'];
   let count_fontsizes= ['64px','128px','256px'];
   const count_engine= setInterval(function()
   {
      pokeready.textContent= count_number;
      pokelogs.innerHTML= '';
      pokelogs.append(pokeready);

      pokeready.style.color= count_colors[count_number-1];
      pokeready.style.fontSize= count_fontsizes[count_number-1];

      if( count_number===0 )
      { 
         clearInterval(count_engine);
         pokeready.remove();
         scene_stage();
      }
      count_number--;
   },1000);
}

pokelog_1.start.addEventListener('click',function()
{
   pokeready(function()
   {
      console.log(3333);
   });
});




