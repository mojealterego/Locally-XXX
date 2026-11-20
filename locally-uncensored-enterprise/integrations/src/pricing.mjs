const fail=()=>{throw Error('Invalid freelancer pricing inputs')};
const ranges={netAnnual:[0,100000000],daysPerWeek:[1,7],hoursPerDay:[1,16],vacationDays:[0,100],sickDays:[0,100],adminPercent:[0,90],taxPercent:[0,70],officeMonthly:[0,1000000],softwareMonthly:[0,1000000],insuranceMonthly:[0,1000000],otherMonthly:[0,1000000]};
export const defaultQuote=Object.freeze({netAnnual:50000,daysPerWeek:5,hoursPerDay:8,vacationDays:30,sickDays:10,adminPercent:20,taxPercent:30,officeMonthly:200,softwareMonthly:100,insuranceMonthly:400,otherMonthly:100,currency:'EUR'});
const cents = n => Math.round(n*100)/100;
export function estimateFreelanceRate(input) {
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==Object.keys(defaultQuote).length)fail();
 for(const [key,[min,max]] of Object.entries(ranges))if(!Number.isFinite(input[key])||input[key]<min||input[key]>max)fail();
 if(!['EUR','PLN','USD'].includes(input.currency))fail();
 const workingDays=input.daysPerWeek*52-input.vacationDays-input.sickDays;
 const billableHours=workingDays*input.hoursPerDay*(1-input.adminPercent/100);
 if(workingDays<=0||billableHours<=0)fail();
 const annualExpenses=12*(input.officeMonthly+input.softwareMonthly+input.insuranceMonthly+input.otherMonthly);
 // Effective tax rate is applied to pre-tax profit, not to deductible expenses.
 const grossRevenue=input.netAnnual/(1-input.taxPercent/100)+annualExpenses;
 if(!Number.isFinite(grossRevenue)||grossRevenue>1e10)fail();
 return Object.freeze({currency:input.currency,annualExpenses:cents(annualExpenses),billableHours:cents(billableHours),annualRevenue:cents(grossRevenue),hourlyRate:cents(grossRevenue/billableHours),dailyRate:cents(grossRevenue/billableHours*input.hoursPerDay),monthlyRevenue:cents(grossRevenue/12),assumption:'flat effective profit tax; no VAT; editable estimate, not tax advice'});
}
