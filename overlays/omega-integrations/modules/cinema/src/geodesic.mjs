/** Traversal on world cell topology; discrete geodesic approximation, not surface differential geometry. */
export function shortestGeodesicPath(world,startId,endId){
 const fail=(code)=>({ok:false,path:[],length:0,error:code});
 if(!world || !Number.isFinite(world.cellSize) || world.cellSize<=0 || !Array.isArray(world.cells))return fail('INVALID_WORLD');
 const byId=new Map();const byCoords=new Map();
 for(const c of world.cells){
   const cost=c.terrainCost??1;
   if(typeof c.id!=='string'||!Number.isSafeInteger(c.x)||!Number.isSafeInteger(c.y)||!Number.isFinite(cost)||cost<=0)return fail('INVALID_CELL_OR_COST');
   const k=`${c.x}:${c.y}`;
   if(byId.has(c.id)||byCoords.has(k))return fail('DUPLICATE_CELL_OR_COORDINATE');
   byId.set(c.id,{...c,terrainCost:cost});byCoords.set(k,c.id);
 }
 if(!byId.has(startId)||!byId.has(endId))return fail('UNKNOWN_ENDPOINT');
 const distances=new Map([[startId,0]]);const paths=new Map([[startId,[startId]]]);const settled=new Set();
 while(true){
   const candidates=[...distances.keys()].filter(x=>!settled.has(x)).sort((a,b)=>distances.get(a)-distances.get(b) || paths.get(a).join('\0').localeCompare(paths.get(b).join('\0'),'en'));
   if(candidates.length===0)break;
   const id=candidates[0];if(id===endId)return {ok:true,path:paths.get(id),length:distances.get(id),error:null};
   settled.add(id);const curr=byId.get(id);
   for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
     const target=byCoords.get(`${curr.x+dx}:${curr.y+dy}`);if(!target || settled.has(target))continue;
     const destination=byId.get(target);
     const w=world.cellSize*(curr.terrainCost+destination.terrainCost)/2;
     const alternate=distances.get(id)+w;
     const newPath=[...paths.get(id),target];const old=distances.get(target);
     if(old===undefined || alternate<old-1e-10 || (Math.abs(alternate-old)<=1e-10 && newPath.join('\0')<paths.get(target).join('\0'))){
       distances.set(target,alternate);paths.set(target,newPath);
     }
   }
 }
 return fail('NO_PATH');
}
