import { cards, faq, h2, h3, keys, list, note, p, steps, table, tip, ui, warn } from '../kit.mjs';

export default {
  title: 'Getting started',
  pages: [
    {
      slug: 'install',
      nav: 'Install on Windows',
      title: 'Install Codevalanche on Windows',
      seoTitle: 'Install Codevalanche on Windows 11',
      description: 'Download and install Codevalanche on Windows 11, get past SmartScreen, finish the first setup and connect your first AI.',
      body: `
${h2('requirements', 'What you need')}
${table([
  ['System', 'Windows 11, 64-bit.'],
  ['Download', 'One <code>.exe</code> installer of about 340 MB from the <a href="/download/">download page</a>.'],
  ['An AI', 'An account with an AI you already use (for example Claude or ChatGPT), an API key, or a model that runs on your own PC. See <a href="/docs/your-ais/">Connect your AIs</a>.'],
  ['Disk space for local models', 'Only if you want models on your PC. Each model shows its size and whether it fits your computer before you download it.'],
])}
${h2('install', 'Install')}
${steps([
  ['Download the installer.', 'Open the <a href="/download/">download page</a> and choose Download for Windows.'],
  ['Open it from your Downloads folder.', 'Double-click the <code>.exe</code> file.'],
  ['If Windows SmartScreen appears,', `choose ${ui('More info')}, then ${ui('Run anyway')}.`],
  ['Wait for the installer to finish.', 'Codevalanche opens by itself when it is done.'],
])}
${note('SmartScreen shows its warning for apps it has not seen often yet. The installer is the same file the download page links to; nothing else is downloaded during setup without telling you.')}
${h2('first-start', 'The first start')}
${p('On the first start Codevalanche asks you to sign in to a Codevalanche account or to continue as Guest. The account keeps your Codevalanche profile; it does not connect any AI. Your AI accounts are connected separately, in Your AIs.')}
${p('Then a short setup helps you connect your first AI. You can skip it and come back later from Settings.')}
${steps([
  ['Connect one AI.', `Open ${ui('Your AIs')} and pick a way in: sign in with your subscription, paste an API key, or set up a model on this PC.`],
  ['Open a folder.', `Use ${ui('Open folder')} (${keys('Ctrl', 'O')}) to add a project folder from your computer.`],
  ['Start a conversation.', `Press ${keys('Ctrl', 'N')} for a new chat, choose the model and write what you want.`],
])}
${tip('The setup offers a prepared read-only first task. It shows how approvals work on something that cannot damage anything. Then follow <a href="/docs/first-task/">Your first task</a>.')}
${h2('where-files-live', 'Where Codevalanche keeps its files')}
${p(`Your project folders stay where they are. Codevalanche keeps its own data (conversations, settings, local models, voices and downloaded updates) on this computer. ${ui('Settings')} › ${ui('Storage')} shows how much space each part uses and lets you free space.`)}
${h2('uninstall', 'Uninstall')}
${p('Remove Codevalanche like any Windows app, from Settings › Apps › Installed apps. Your project folders are not touched.')}
${faq([
  ['Is there a Mac version?', 'Not yet. Codevalanche is available for Windows 11 today.'],
  ['Do I need to install Codex separately?', 'No. Codex is included with Codevalanche. Claude Code, Gemini CLI and ZCode are installed separately; the app tells you when one is missing and helps you install it.'],
  ['Do I need an account?', 'You can continue as Guest. To use an AI you connect your own AI account, API key or local model.'],
])}`,
    },
    {
      slug: 'concepts',
      nav: 'Core ideas',
      title: 'Core ideas',
      seoTitle: 'Core ideas: projects, conversations, agents and the Coordinator',
      description: 'The handful of ideas behind Codevalanche: your AIs, projects, conversations, agents, the Coordinator, approvals and undo.',
      body: `
${p('Codevalanche is a Windows app where AI coding agents work on your code. You bring the AI: your Claude, ChatGPT or other subscription, an API key, or a model on your own PC. The app gives every agent the same place to work, the same approvals and the same history.')}
${h2('your-ais', 'Your AIs')}
${p(`Everything that thinks for you is connected in ${ui('Your AIs')}. There are three ways in: <strong>with your subscription or account</strong> (Claude Code, Codex, ZCode and others), <strong>with an API key</strong> (Anthropic, OpenAI, Google, DeepSeek, Z.ai, xAI, Moonshot and more), and <strong>models that run on this PC</strong>. You can add several accounts for the same AI. <a href="/docs/your-ais/">Connect your AIs</a>.`)}
${h2('agents', 'Agents')}
${p('An agent is the program that actually does the work: reads files, runs commands, edits code. Claude Code, Codex, Gemini CLI, ZCode, OpenCode, Grok Build, Kimi Code and Pi are agents. Codevalanche starts them with your own sign-in and shows everything they do.')}
${h2('projects', 'Projects')}
${p('A project is one piece of work: one or more folders on your PC and all the conversations about them. Projects sit in the left bar. <a href="/docs/projects/">Projects</a>.')}
${h2('conversations', 'Conversations')}
${p('A conversation is you and one agent working on something. You choose the model, the permission mode and what to attach. Each conversation keeps its full history, the files it changed and every approval. <a href="/docs/agents/conversations/">Conversations and the composer</a>.')}
${h2('coordinator', 'The Coordinator')}
${p('Turn on the Coordinator in a project and give it a goal. It writes a plan, starts an agent for each task in its own conversation, checks the results and tells you when it needs you. <a href="/docs/projects/coordinator/">The Coordinator</a>.')}
${h2('safety', 'Approvals and undo')}
${p('Agents ask before they do things you have not allowed: a command, a file change, using an app. You answer with Allow or Deny. After a turn you can see every changed file and undo the turn. <a href="/docs/agents/approvals/">Approvals and permissions</a> · <a href="/docs/agents/undo/">Undo changes</a>.')}
${h2('next', 'Where to go next')}
${cards([
  ['/docs/first-task/', 'Your first task', 'A small, safe change from request to result.'],
  ['/docs/your-ais/', 'Connect your AIs', 'Subscriptions, API keys and several accounts.'],
  ['/docs/projects/coordinator/', 'The Coordinator', 'One goal, many agents working for you.'],
  ['/docs/local-models/', 'Local models', 'Run models on your own PC, offline.'],
])}`,
    },
    {
      slug: 'first-task',
      nav: 'Your first task',
      title: 'Your first task',
      seoTitle: 'Your first task with an AI coding agent',
      description: 'A practical first task: open a project, write a narrow request, follow the agent, answer approvals, then read the changes and test them.',
      body: `
${p('The best first task is small and easy to check. This walkthrough uses an example: show trip durations of 90 minutes as “1 h 30 min” and add tests.')}
${h2('prepare', 'Prepare')}
${steps([
  ['Connect an AI.', 'If you have not yet, see <a href="/docs/your-ais/">Connect your AIs</a>.'],
  ['Open a project folder.', `${ui('Open folder')} (${keys('Ctrl', 'O')}). Use a project you can safely change, ideally one in git so every change is easy to see.`],
  ['Start a new chat.', `${keys('Ctrl', 'N')}. Check the model and the permission mode in the message box before you send.`],
])}
${h2('write', 'Write a narrow request')}
${p('Say what happens now, what you want instead and how to check it:')}
<pre class="docs-code"><code>Trip durations show as “90 min”. Show them as “1 h 30 min” everywhere
(hours only when there are 60 minutes or more). Add tests for 0, 59, 60
and 90 minutes and run the test suite.</code></pre>
${tip('One clear goal per request works better than a list of unrelated changes. You can always send a follow-up; it waits in the queue while the agent works.')}
${h2('follow', 'Follow the agent')}
${list([
  'Progress shows as the agent reads files, runs commands and edits code.',
  `If it needs permission, a ${ui('Needs approval')} card shows exactly what it wants to run or change. Choose ${ui('Allow once')}, a longer-lasting option, or ${ui('Deny')}. See <a href="/docs/agents/approvals/">Approvals</a>.`,
  `To stop it, press ${keys('Esc')} in the message box.`,
  'To change direction while it works, write a follow-up. See <a href="/docs/agents/steering/">Steer and queue messages</a>.',
])}
${h2('check', 'Check the result')}
${steps([
  ['Read the changes.', `Open ${ui('Changes')} (${keys('Ctrl', '2')}) to see every changed file and line.`],
  ['Run the checks yourself.', 'Run the project’s tests or open the app and try the change. Treat the agent’s summary as a guide, not proof.'],
  ['Keep it or undo it.', `If you do not like the result, use ${ui('Undo this turn’s changes')}. See <a href="/docs/agents/undo/">Undo changes</a>.`],
])}
${warn('Approving a command allows that operation. It does not mean the result is right; always look at the changes.')}
${h2('next', 'Next')}
${p('Once single conversations feel natural, try a project with the <a href="/docs/projects/coordinator/">Coordinator</a>: one goal, several agents, checked results.')}`,
    },
  ],
};
