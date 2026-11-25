// Trust pages: every address the app talks to, and how to check our claims.
// Facts come from the app's code (read 24 Nov 2026 for the 1.1.75 line).
// Write only what can be checked; no promise the code does not keep.
import { h2, p, list, steps, table, ui, note, faq } from '../kit.mjs';

const ADDR = text => `<code>${text}</code>`;

export const network = {
  slug: 'privacy/network',
  nav: 'What connects to the internet',
  title: 'What Codevalanche connects to',
  seoTitle: 'The internet connections Codevalanche makes',
  description: 'The addresses the Codevalanche desktop app contacts: when, why and what is sent. The published app sends no usage statistics or error reports.',
  body: `
${p('This page lists the addresses the Codevalanche desktop app contacts, as found in the app’s code on 24 November 2026, for version 1.1.75.')}
${list([
  'The published app sends no usage statistics and no error reports.',
  'Your prompts, conversations, files and code do not pass through Codevalanche’s servers. They go from your PC to the AI provider you pick.',
  'There is no third-party analytics or tracking code in the app.',
  'Without an account, the app itself downloads public files (updates and the model list). If you open local models, it also looks them up on huggingface.co.',
])}
${h2('always', 'Public files the app downloads')}
${p('These requests are plain downloads. They carry no account, no cookie and no installation ID. The server sees your IP address, as with any download.')}
${table([
  ['Update check', `Codevalanche’s public release files on ${ADDR('github.com')}`, 'When the app starts, then every 30 minutes while it is open. It cannot be turned off, so you always hear about security fixes.', 'Nothing about you. Every installer is checked against its published checksum before it is installed.'],
  ['Model list', `Same place, ${ADDR('github.com')}`, 'When the app shows the list of models, at most once every 6 hours.', 'Nothing about you. The list is signed; the app rejects a list with a wrong signature.'],
  ['Agent compatibility list', `Same place, ${ADDR('github.com')}`, 'Together with the model list, at most once every 6 hours.', 'Nothing about you.'],
], ['What', 'Address', 'When', 'What is sent'])}
${p(`When you pick a local model on the start screen or open Settings › Local AI, the app also contacts ${ADDR('huggingface.co')} to look up local models.`)}
${h2('switch', 'Usage statistics and error reports')}
${p('The published app (1.1.75) has no switch for usage statistics or error reports, and sends neither. If a later version adds them, they will be off until you turn them on in Settings, and this page will say exactly what is sent.')}
${h2('you', 'Only when you do it')}
${table([
  ['Codevalanche account', 'Our accounts service and codevalanche.com', 'Only if you sign in.', 'Your email address and sign-in. The app works without an account.'],
  ['Feedback', 'Our accounts service', 'Only when you press send and tick the consent box.', 'The text you write (up to 4,000 characters), its category and your platform. Keys, tokens and other secrets are removed from the text first.'],
], ['What', 'Address', 'When', 'What is sent'])}
${h2('ai', 'The AI you choose')}
${p('Your messages and the files an agent reads go from your PC straight to the AI provider you picked. Codevalanche does not sit in the middle and keeps no copy on a server.')}
${table([
  ['Claude Code and Codex', 'Anthropic and OpenAI, through their own official apps', 'When you use them.', 'Whatever those apps send, under their own terms. Codevalanche runs them unchanged.'],
  ['Your own API keys', `${ADDR('api.anthropic.com')}, ${ADDR('api.openai.com')}, ${ADDR('api.deepseek.com')}, ${ADDR('api.groq.com')}, ${ADDR('api.x.ai')}, ${ADDR('api.moonshot.ai')}, ${ADDR('api.z.ai')}, ${ADDR('auth.kimi.com')}`, 'Only for a provider whose key you added.', 'Your messages and the context of the task, to that provider only.'],
  ['Voice dictation in the cloud', `${ADDR('api.groq.com')}, ${ADDR('api.openai.com')}`, 'Only if you added a Groq or OpenAI key, chose cloud voice and accepted the notice that names the provider.', 'The recorded audio, with your key, to your provider.'],
  ['Phone notifications', ADDR('exp.host'), 'Only if you paired a phone.', 'A short generic text, the conversation ID and the approval ID, through Expo, then Apple or Google.'],
  ['Chatting with a local model', 'No address', 'While you use it.', 'The model runs on your PC, so your messages stay there. Downloading a model is listed below.'],
], ['What', 'Address', 'When', 'What is sent'])}
${h2('downloads', 'Downloads')}
${table([
  ['Installing Claude Code', ADDR('claude.ai'), 'When you install or update it from the app.'],
  ['Installing Codex', `${ADDR('github.com')}, ${ADDR('api.github.com')}`, 'When you install or update it from the app.'],
  ['Other AI apps (Grok, OpenCode, Kimi, Antigravity and others)', `Each one’s official source, for example ${ADDR('registry.npmjs.org')}, ${ADDR('github.com')} or ${ADDR('storage.googleapis.com')}`, 'Only when you install one.'],
  ['Local models', ADDR('huggingface.co'), 'When you search for or download a model.'],
  ['Voice dictation model', ADDR('huggingface.co'), 'Once, when you set up dictation. Speech is turned into text on your PC.'],
  ['Android preview', ADDR('dl.google.com'), 'Only when you set it up.'],
  ['Updates of the AI apps above', 'The same sources', 'Automatically, on by default, for AI apps installed from Codevalanche.'],
  ['Microsoft WebView2', 'Microsoft', 'At install time, only if your PC does not have it yet.'],
], ['What', 'Address', 'When'])}
${h2('tools', 'Tools you connect')}
${list([
  `GitHub: ${ADDR('api.github.com')} for pull requests and activity, with your own account.`,
  'Connections (MCP) you add: only the address of each one, for example a database service.',
  'The built-in browser and preview: only the pages you open.',
  'Videos in a chat: if a message contains a link to YouTube, Vimeo or a similar site, the player loads from that site.',
  'Images and charts in answers: an answer can show images hosted on other websites, which load automatically. Interactive charts may load code from jsDelivr, cdnjs or unpkg and fonts from Google Fonts.',
  'Link icons in answers: for a link in an answer, the app requests the small site icon directly from that website, not through another service.',
])}
${h2('never', 'What the app does not contain')}
${list([
  'No third-party analytics, tracking or crash-reporting service.',
  'No connection that sends your prompts, conversations, files, code, keys or screenshots to Codevalanche.',
  'Nothing from the sign-in files of Claude Code or Codex leaves your PC. The app reads which account is signed in only to show it to you.',
])}
${note('Want to check this list yourself? See <a href="/docs/privacy/check/">Check it yourself</a>.')}`,
};

export const check = {
  slug: 'privacy/check',
  nav: 'Check it yourself',
  title: 'Check it yourself',
  seoTitle: 'How to check what Codevalanche sends',
  description: 'Steps anyone can repeat on their own PC to check what Codevalanche sends: live network connections and a search for tracking code.',
  body: `
${p('You do not have to take our word for it. These checks use tools that come with Windows. They take about ten minutes.')}
${h2('switch', '1. No statistics are sent')}
${p('The published app (1.1.75) has no statistics switch and sends no usage statistics or error reports. If a later version adds the switch, it will be off on a new installation.')}
${h2('connections', '2. Watch the connections')}
${steps([
  ['Start Codevalanche and do not sign in.', ''],
  ['Open Resource Monitor.', 'Press Windows+R, type resmon and press Enter.'],
  ['Open the Network tab.', 'Under Processes with Network Activity, tick Codevalanche.exe and codevalanche-agent-process-host.exe.'],
  ['Read the addresses under Network Activity and TCP Connections.', 'Compare them with <a href="/docs/privacy/network/">the list of addresses</a>.'],
])}
${p('With no account, you should see GitHub addresses (github.com or githubusercontent.com) for the public files. huggingface.co appears too once you open local models (start screen or Settings › Local AI). Once you use an AI, its own provider appears too, for example Anthropic or OpenAI. The AI apps run as their own processes, for example claude.exe and codex.exe, and talk to their own companies.')}
${h2('trackers', '3. Search for tracking code')}
${steps([
  ['Find where Codevalanche is installed.', 'Usually %LOCALAPPDATA%\\Programs\\Codevalanche. You can also right-click its shortcut and choose Open file location.'],
  ['Open PowerShell in the folder resources\\app\\studio-static.', ''],
  ['Run this search.', ''],
])}
<pre><code>Get-ChildItem -Recurse -File | Select-String -List -Pattern 'posthog','mixpanel','hotjar','googletagmanager'</code></pre>
${p('It should find nothing. These are common analytics and tracking services.')}
${p('Two words can look suspicious in a wider search. Sentry is also the name of a colour theme for code, and amplitude is a word used in graphics and audio. Addresses such as youtube.com or vimeo.com are the video sites a chat is allowed to show when a message links to them.')}
${h2('website', '4. The website')}
${list([
  'codevalanche.com sets no cookie for counting visits.',
  'A visit is counted without an ID. If your browser sends Global Privacy Control or Do Not Track, the visit is not counted.',
  'Website analytics with more detail run only if you press Accept.',
])}
${p('You can check this in your browser’s developer tools, on the Network and Application tabs.')}
${h2('limits', 'What these checks do not cover')}
${list([
  'What Claude Code, Codex and the other AI apps send to their own companies. They are those companies’ tools, under their own terms.',
  'Data kept on your own PC. Settings › Storage shows what Codevalanche keeps.',
])}
${faq([
  ['Found something that does not match?', 'Write to <a href="mailto:security@radovar.com">security@radovar.com</a>. See <a href="/security/#report">Report a security issue</a>.'],
  ['Which version does this describe?', 'Codevalanche 1.1.75, checked on 24 November 2026. When a release changes what the app sends, this page changes with it.'],
])}`,
};

export const trust = [network, check];
