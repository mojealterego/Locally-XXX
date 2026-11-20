/** Typed, offline UI dictionary. Technical identifiers and prompts are not translated. */
export type Locale = 'pl' | 'en'
export function normalizeLocale(value: unknown): Locale { return value === 'en' ? 'en' : 'pl' }
export function localeTag(value: unknown): 'pl-PL' | 'en-US' { return normalizeLocale(value) === 'en' ? 'en-US' : 'pl-PL' }
const polish = {
  Chat: 'Czat', Create: 'Tworzenie', Compare: 'Porównanie', Benchmark: 'Test wydajności', Models: 'Modele', Settings: 'Ustawienia',
  'Toggle sidebar': 'Przełącz panel boczny', 'Light Mode': 'Tryb jasny', 'Dark Mode': 'Tryb ciemny', More: 'Więcej', Dismiss: 'Zamknij', Refresh: 'Odśwież',
  General: 'Ogólne', 'AI Backends': 'Silniki AI', Agent: 'Agent', 'Voice & Remote': 'Głos i dostęp zdalny', Appearance: 'Wygląd', Theme: 'Motyw', Light: 'Jasny', Dark: 'Ciemny', Generation: 'Generowanie', Temperature: 'Temperatura', Language: 'Język',
  'Get Started': 'Rozpocznij', Continue: 'Kontynuuj', 'Skip for now': 'Pomiń na razie', 'Ready to chat': 'Gotowy do rozmowy', 'Use another engine (Ollama, LM Studio…)': 'Użyj innego silnika (Ollama, LM Studio…)', 'Scan again': 'Skanuj ponownie', Recommended: 'Zalecany', 'Pick a starter model': 'Wybierz model startowy', Unfiltered: 'Bez filtrów', Mainstream: 'Standardowe',
  'Private, local AI chat that works right away. No extra software to install. No servers, no tracking, everything stays on your machine.': 'Prywatny, lokalny czat AI gotowy do działania bez dodatkowego oprogramowania. W trybie lokalnym dane pozostają na urządzeniu.',
  'One small model to get you running. You can browse and install more from the Models tab once you\'re in.': 'Na początek wystarczy mały model. Kolejne możesz pobrać w zakładce Modele.',
  "You're all set!": 'Wszystko gotowe!', 'Install Ollama': 'Zainstaluj Ollama', 'Install ComfyUI (Recommended)': 'Zainstaluj ComfyUI (zalecane)', 'Installed. Document Chat is ready.': 'Zainstalowano. Czat z dokumentami jest gotowy.',
  'Minimize': 'Minimalizuj', 'Maximize': 'Maksymalizuj', Close: 'Zamknij', 'Edit persona': 'Edytuj personę', 'Delete persona': 'Usuń personę',
} as const
export type TranslationKey = keyof typeof polish
export const translationKeys = Object.freeze(Object.keys(polish) as TranslationKey[])
export function translate(locale: unknown, key: TranslationKey): string {
  if (!Object.hasOwn(polish, key)) throw new RangeError('Unknown translation key')
  return normalizeLocale(locale) === 'en' ? key : polish[key]
}
export function installModelsLabel(locale: unknown, count: number): string {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid model count')
  if (normalizeLocale(locale) === 'en') return `Install ${count} model${count === 1 ? '' : 's'}`
  const last = count % 10, tens = count % 100
  return `Zainstaluj ${count} ${count === 1 ? 'model' : last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14) ? 'modele' : 'modeli'}`
}
const personas: Readonly<Record<string,string>> = Object.freeze({
  assistant:'Pomocny asystent',coder:'Ekspert kodowania',writer:'Trener pisania',researcher:'Analityk badawczy',translator:'Tłumacz',unrestricted:'Bez filtrów',devil:'Adwokat diabła',sigma:'Sigma',roast:'Mistrz ciętej riposty',conspiracy:'Teoretyk spiskowy','drunk-prof':'Pijany profesor',villain:'Superzłoczyńca','time-traveler':'Podróżnik w czasie',sarcasm:'Maksymalny sarkazm',chadgpt:'ChadGPT',therapist:'Ekscentryczny terapeuta',pirate:'Pirat AI',philosopher:'Kryzys egzystencjalny','gen-alpha':'Pokolenie Alfa',narrator:'Morgan Freeman',hacker:'L33T H4X0R',gordon:'Szef kuchni Ramsay',alien:'Zdezorientowany kosmita',rizz:'Trener flirtu',medieval:'Średniowieczny chłop',
})
export function personaName(locale: unknown, persona: {id:string;name:string;isBuiltIn?:boolean}): string {
  return normalizeLocale(locale) === 'pl' && persona.isBuiltIn && Object.hasOwn(personas,persona.id) ? personas[persona.id] : persona.name
}
