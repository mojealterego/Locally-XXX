export class ValidationError extends Error { constructor(message){super(message);this.name='ValidationError'} }
export class NotAllowedError extends Error { constructor(message){super(message);this.name='NotAllowedError'} }
export const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
export const nonblank=x=>typeof x==='string'&&x.trim().length>0&&x.length<=500;
export const assert=(condition,message)=>{if(!condition)throw new ValidationError(message)};
