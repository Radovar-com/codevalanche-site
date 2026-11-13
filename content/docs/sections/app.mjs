import { faq, h2, keys, list, note, p, steps, table, tip, ui, warn } from '../kit.mjs';

export const app = {
  title: 'The app',
  pages: [
    {
      slug: 'app/languages',
      nav: '17 languages',
      title: 'Use Codevalanche in 17 languages',
      seoTitle: 'Codevalanche in 17 languages',
      description: 'Codevalanche speaks 17 languages, from English and Romanian to Arabic, Hindi, Japanese and Chinese. Change the interface language in Settings.',
      body: `
${p('The whole app is translated into 17 languages, including right-to-left Arabic.')}
${h2('list', 'The languages')}
${table([
  ['English', 'العربية الفصحى (Arabic)', 'Deutsch'],
  ['Español', 'Français', 'हिन्दी (Hindi)'],
  ['Bahasa Indonesia', 'Italiano', '日本語 (Japanese)'],
  ['한국어 (Korean)', 'Português (Brasil)', 'Română'],
  ['Русский', 'Türkçe', 'Tiếng Việt'],
  ['简体中文', '繁體中文', ''],
])}
${h2('change', 'Change the language')}
${steps([
  ['Open Settings', `(${keys('Ctrl', ',')}).`],
  [`Choose ${ui('Interface language')}.`, `Pick a language, or ${ui('System language')} to follow Windows. If Windows uses a language the app does not offer, it says which one it uses instead.`],
])}
${h2('agents', 'The agents’ language')}
${p('The interface language changes Codevalanche’s own words. The agents answer in the language you write to them in. Dictation understands 99 languages and can detect yours automatically; see <a href="/docs/agents/voice/">Voice</a>.')}
${note('This website is available in the same 17 languages from the language menu at the bottom of each page. The detailed docs pages are in English for now.')}`,
    },
    {
      slug: 'app/updates',
      nav: 'Updates',
      title: 'Updates',
      seoTitle: 'How Codevalanche updates itself',
      description: 'How Codevalanche finds, downloads, verifies and installs updates, how required updates work, and where to read the release notes.',
      body: `
${p('Codevalanche checks a public, signed update file regularly. It sends nothing that identifies you.')}
${h2('flow', 'How an update arrives')}
${steps([
  [`${ui('Update available')}.`, 'Codevalanche waits for you to start the download.'],
  ['Download.', 'You can keep working. If the connection drops, the verified part is kept and the download resumes.'],
  ['Verification.', 'The downloaded installer is checked against the checksum published for the release. If it does not match, it is quarantined and never installed. A release without a checksum is not installed either.'],
  [`${ui('Ready to install')}.`, 'Codevalanche closes, installs the update silently and reopens.'],
])}
${h2('required', 'Required updates')}
${p(`A version that is no longer supported shows ${ui('Required update')}. Install it to keep using Codevalanche.`)}
${h2('notes', 'Release notes')}
${p('After an update Codevalanche shows what changed. Settings › About lets you read the same notes again, with the full release history. The <a href="/changelog.html">changelog</a> on this site has them too.')}
${h2('agents', 'Updates of the AI apps')}
${p('Codex updates on its own while idle. For Claude Code, Gemini CLI and other agents, AI apps on this PC shows when an update is available and installs it for you when it can. See <a href="/docs/your-ais/">Connect your AIs</a>.')}
${h2('problems', 'If an update fails')}
${p('Your installed app stays as it was. See <a href="/docs/troubleshooting/install-and-updates/">Install and update problems</a>.')}`,
    },
    {
      slug: 'app/account',
      nav: 'Your account',
      title: 'Your Codevalanche account',
      seoTitle: 'Your Codevalanche account and Guest mode',
      description: 'What the Codevalanche account is for, how to sign in or continue as Guest, and how it differs from your AI accounts.',
      body: `
${p('The Codevalanche account is your profile with Codevalanche. It is separate from your AI accounts: signing in here does not connect Claude, ChatGPT or any other AI.')}
${h2('sign-in', 'Sign in or continue as Guest')}
${list([
  'Sign in with email or Google. Sign-in happens securely in your browser, then Codevalanche opens again.',
  'Or continue as Guest and use the app without an account.',
  'The session works offline for up to 30 days, then the app asks you to sign in again. Nothing is lost.',
])}
${h2('manage', 'Manage it')}
${p('On the website, <a href="/account/">your account</a> shows your profile, your signed-in sessions (and lets you end them), and lets you delete the account.')}
${h2('data', 'What the account holds')}
${p('Your email address, display name, optional short bio and sign-in method. Never your prompts, conversations, code or keys. See <a href="/docs/privacy/">Where your code goes</a>.')}`,
    },
    {
      slug: 'app/import',
      nav: 'Import conversations',
      title: 'Import conversations from other AI apps',
      seoTitle: 'Import Claude Code, Codex and ChatGPT conversations',
      description: 'Bring your existing conversations from other AI apps on your PC, or from a ChatGPT export, into Codevalanche and keep them in sync.',
      body: `
${p(`${ui('Bring conversations from other AI apps')} in Settings finds AI apps on this PC whose conversations can be imported.`)}
${h2('apps', 'From apps on this PC')}
${steps([
  ['Open the import settings.', 'Codevalanche lists the apps it found.'],
  ['Choose what to import.', ''],
  ['Keep in sync (optional).', 'While Codevalanche runs, it imports new conversations from those apps shortly after they appear.'],
])}
${h2('chatgpt', 'From ChatGPT')}
${steps([
  ['Export your data', 'in ChatGPT’s settings.'],
  ['Point Codevalanche at the export:', 'the <code>conversations.json</code> file or the export <code>.zip</code>.'],
])}
${note('Continuing an imported conversation keeps your local changes; it continues in a new conversation when needed.')}`,
    },
    {
      slug: 'app/shortcuts',
      nav: 'Keyboard shortcuts',
      title: 'Keyboard shortcuts',
      seoTitle: 'Codevalanche keyboard shortcuts',
      description: 'All default keyboard shortcuts in Codevalanche: command palette, new chat, voice mode, panes, the message box. Change any of them in Settings.',
      body: `
${p(`Change, add or reset shortcuts in Settings › ${ui('Keyboard shortcuts')}. Shortcuts that belong to one place, such as the message box, are fixed.`)}
${h2('global', 'Everywhere')}
${table([
  [keys('Ctrl', 'K'), 'Open the command palette'],
  [keys('Ctrl', 'I'), 'Focus the message box'],
  [keys('Ctrl', 'N'), 'New chat'],
  [keys('Ctrl', 'Shift', 'N'), 'New window'],
  [keys('Ctrl', 'O'), 'Open folder'],
  [keys('Ctrl', ','), 'Open settings'],
  [keys('Ctrl', 'F'), 'Search chats'],
  [keys('Ctrl', 'Shift', 'Space'), 'Start or stop voice mode'],
], ['Keys', 'Action'])}
${h2('panes', 'Panes and layout')}
${table([
  [keys('Ctrl', '1'), 'Show or hide Files'],
  [keys('Ctrl', '2'), 'Show or hide Changes'],
  [keys('Ctrl', '3'), 'Show or hide the Browser'],
  [keys('Ctrl', '4'), 'Show or hide the Terminal pane'],
  [keys('Ctrl', '5'), 'Show or hide the side chat'],
  [keys('Ctrl', '\\'), 'Close all panes'],
  [keys('Ctrl', 'B'), 'Show or hide the project sidebar'],
  [keys('Ctrl', 'J'), 'Show or hide the terminal'],
  [keys('Ctrl', 'P'), 'Open the Files panel'],
  [keys('Ctrl', 'T'), 'Open the Browser panel'],
  [keys('Ctrl', 'Alt', 'S'), 'Open the side chat'],
], ['Keys', 'Action'])}
${h2('composer', 'In the message box')}
${table([
  [keys('Enter'), 'Send, or queue if a run is in progress'],
  [keys('Shift', 'Enter'), 'New line'],
  [keys('Esc'), 'Stop the run'],
  [keys('Ctrl', 'U'), 'Add photos and files'],
  ['<code>/</code>', 'Open slash commands'],
], ['Keys', 'Action'])}`,
    },
  ],
};

export const privacy = {
  title: 'Privacy and security',
  pages: [
    {
      slug: 'privacy',
      nav: 'Where your code goes',
      title: 'Where your code goes',
      seoTitle: 'Where your code goes: privacy in Codevalanche',
      description: 'Your code and conversations go straight from your PC to the AI you chose, or never leave it with local models. What is stored, where, and how keys are protected.',
      body: `
${p('The short version: your conversations, files and code do not pass through Codevalanche’s servers. They go straight from your computer to the AI provider you picked, or never leave your computer if you use a local model.')}
${h2('flows', 'Where each thing goes')}
${table([
  ['Your messages, the files the agent reads, tool results', 'To the AI provider you chose (for example Anthropic, OpenAI, Google), under its terms.'],
  ['The same, with a local model', 'Nowhere. They stay on your computer.'],
  ['Voice dictation', 'Turned into text on your computer by default. Only if you choose so, to Groq or OpenAI with your key.'],
  ['Computer use screenshots', 'To the model you picked, only while you use the feature.'],
  ['Connectors (GitHub, Figma, Google, Vercel…)', 'Only what the features you use need.'],
], ['What', 'Where it goes'])}
${h2('local', 'What stays on your computer')}
${list([
  'Conversations and run history, preferences, Computer use rules, voice transcripts and the app log (passwords and tokens masked).',
  'API keys, connector sign-ins and your account session, encrypted and tied to your Windows account.',
  'The AI apps (Claude Code, Codex and others) keep their own data in their own folders.',
])}
${p('Settings › Storage shows what Codevalanche keeps and how much space it uses.')}
${h2('codevalanche', 'What Codevalanche receives')}
${list([
  'Your account details if you create an account.',
  'Feedback, only when you send it. Keys, tokens, email addresses and personal folder paths are removed from the text first.',
  'Four anonymous usage signals, only if you turn on usage statistics. They are off by default.',
])}
${p('Codevalanche never receives your prompts, conversations, files, code, API keys or screenshots.')}
${h2('downloads', 'What the app downloads')}
${p('A public, signed update file; AI tools, local models, engines and voices when you ask for them. Those servers see your IP address, as with any download.')}
${p('Full details are in the <a href="/privacy.html">privacy policy</a>. For how the app is protected, see <a href="/security/">Security</a>.')}`,
    },
  ],
};
