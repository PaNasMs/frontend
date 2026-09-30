export declare function notificationCatalog(): {
  actions: Record<string, Record<'en' | 'ru' | 'uk', string>>
  messages: (Record<'en' | 'ru' | 'uk', string> & { source: string[] })[]
}
