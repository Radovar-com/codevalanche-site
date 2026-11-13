import { faq, h2, keys, list, note, p, steps, table, tip, ui, warn } from '../kit.mjs';

export default {
  title: 'Working with agents',
  pages: [
    {
      slug: 'agents/conversations',
      nav: 'Conversations and the composer',
      title: 'Conversations and the message box',
      seoTitle: 'Conversations, the model picker and slash commands',
      description: 'Start a conversation, choose the model and permission mode, use slash commands and the command palette, and follow an agent’s work.',
      body: `
${p('A conversation is you and one agent working on something in a project. Everything starts in the message box at the bottom.')}
${h2('start', 'Start a conversation')}
${list([
  `${keys('Ctrl', 'N')} starts a new chat in the current project.`,
  `${keys('Ctrl', 'I')} puts the cursor in the message box from anywhere in the app.`,
  `${keys('Ctrl', 'F')} searches your chats.`,
])}
${h2('message-box', 'The message box')}
${table([
  ['Model picker', 'Choose the model, and with it the account and the AI app that runs it. A model that cannot run here says why, for example that no app on this computer can run it yet.'],
  ['Permission button', 'Choose what the agent may do without asking. The modes come from the AI app itself. See <a href="/docs/agents/approvals/">Approvals and permissions</a>.'],
  ['Attach', `Add pictures and files (${keys('Ctrl', 'U')}). See <a href="/docs/agents/attachments/">Attachments</a>.`],
  ['Microphone', 'Dictate instead of typing. See <a href="/docs/agents/voice/">Voice</a>.'],
  ['Send', `${keys('Enter')} sends. ${keys('Shift', 'Enter')} adds a new line. If the agent is still working, your message is queued.`],
  ['Stop', `${keys('Esc')} stops the agent’s run, even with text in the box.`],
])}
${h2('slash', 'Slash commands')}
${p(`Type <code>/</code> to open the command menu. It lists the AI app’s own commands and Codevalanche’s, such as <code>/goal</code>. Move with the arrow keys and press ${keys('Enter')} to insert the highlighted command. To send text that starts with a slash, start it with a space.`)}
${h2('palette', 'Command palette')}
${p(`${keys('Ctrl', 'K')} opens the command palette: search and run every Codevalanche action from one field.`)}
${h2('follow', 'Follow the work')}
${list([
  'Progress, commands and file changes appear as the agent works.',
  'When an agent starts its own helper agents (subagents), each appears in the conversation with what it returned. For Codex you can stop or message one of them.',
  `${ui('Changes')} (${keys('Ctrl', '2')}) shows every changed file. ${ui('Files')} (${keys('Ctrl', '1')}), ${ui('Browser')} (${keys('Ctrl', '3')}), ${ui('Terminal')} (${keys('Ctrl', '4')}) and the side chat (${keys('Ctrl', '5')}) open beside the conversation.`,
  'A shortcut opens the next conversation that needs you: questions and approvals first, then new results, across all projects.',
])}
${h2('archive', 'Archive and delete')}
${p('Archived conversations are kept read-only under Archived chats; restore one to continue it. Deleting a chat removes it from your list; files already saved in your project stay on disk.')}`,
    },
    {
      slug: 'agents/attachments',
      nav: 'Attachments and annotations',
      title: 'Attachments and annotations',
      seoTitle: 'Attach screenshots and files, and annotate your app for the agent',
      description: 'Attach screenshots, PDFs, documents and code files, paste images, and mark elements on your running app so the agent knows exactly what to change.',
      body: `
${h2('attach', 'Attach files')}
${p(`Use the attach button or ${keys('Ctrl', 'U')}, drag files into the message box, or paste a screenshot.`)}
${table([
  ['Pictures', 'PNG, JPEG, WebP, SVG'],
  ['Documents', 'PDF, DOCX, TXT, Markdown'],
  ['Code and data', 'JSON, YAML, XML, CSV, LOG, TS, JS, PY, CSS, HTML, SQL, TOML'],
], ['Kind', 'Formats'])}
${list([
  'Large images are compressed before sending. If one is still too large, crop it.',
  'Old Word <code>.doc</code> files are not supported; save as DOCX or PDF.',
  'Figma <code>.fig</code> files cannot be read directly; export the frame as PNG, SVG or PDF.',
  'If the selected model cannot read the attached files, the app tells you before sending.',
])}
${h2('annotate', 'Annotate your running app')}
${p(`When your project runs in the ${ui('Browser')} pane, you can point at the exact thing to change instead of describing it.`)}
${steps([
  [`Choose ${ui('Annotate')}.`, 'The preview switches to annotate mode.'],
  ['Click the elements to change.', 'Each one is added to your message under “Marked on the page”.'],
  ['Write what you want done', 'with the marked elements, then send.'],
])}
${p('By default each marked element is sent with a picture of it. Pictures count towards your plan usage. Settings › Browser › Annotation screenshots lets you choose Always include, Ask each time or Never include.')}
${tip(`${keys('Esc')} clears the picked element, or closes the note without sending it. If the page changed after you picked an element, pick it again.`)}`,
    },
    {
      slug: 'agents/approvals',
      nav: 'Approvals and permissions',
      title: 'Approvals and permissions',
      seoTitle: 'Approvals and permission modes for AI coding agents',
      description: 'Decide what agents may do on their own: permission modes for Claude Code, Codex and Gemini CLI, approval cards, and rules for apps.',
      body: `
${p('Agents run commands and change files on your computer, so you decide how much they may do without asking. Codevalanche shows every request the same way, whichever AI app made it.')}
${h2('modes', 'Permission modes')}
${p('The permission button in the message box lists the modes the selected AI app offers. Codevalanche reads them from the app; it does not invent its own. In short:')}
${table([
  ['Claude Code', `${ui('Manual')} · ${ui('Auto')} · ${ui('Accept edits')} · ${ui('Plan')} · ${ui('Don’t ask')} · ${ui('Bypass permissions')}`],
  ['Codex', `${ui('Read only')} · ${ui('Ask for approval')} · ${ui('Approve for me')} · ${ui('Edit project, never ask')} · ${ui('Full access')}`],
  ['Gemini CLI', `${ui('Default')} · ${ui('Auto edit')} · ${ui('Plan')} · ${ui('YOLO')}`],
], ['AI app', 'Modes'])}
${p('Details for each mode: <a href="/docs/your-ais/claude-code/#permissions">Claude Code</a>, <a href="/docs/your-ais/codex/#permissions">Codex</a>, <a href="/docs/your-ais/gemini-cli/#permissions">Gemini CLI</a>.')}
${h2('cards', 'Approval cards')}
${p(`When an agent needs permission, a ${ui('Needs approval')} card shows what it wants: a ${ui('Terminal command')} with the exact command and folder, or ${ui('File changes')}. The conversation shows ${ui('Waiting for your approval')} until you answer.`)}
${table([
  [ui('Allow once'), 'Only this request.'],
  [ui('Yes, for this session'), 'Requests like this one until the session ends.'],
  [ui('Accept file edits for this session'), 'All file edits in this session.'],
  [ui('Yes, don’t ask again'), 'Remembers the rule.'],
  [ui('Deny'), 'Nothing is run. The agent is told and can try another way.'],
], ['Answer', 'What it allows'])}
${p('The options offered depend on the AI app and the request.')}
${warn('Allowing a request allows that operation; it does not check that the result is right. Read the changes afterwards.')}
${h2('apps', 'Agents using other apps')}
${p(`With <a href="/docs/agents/computer-use/">Computer use</a>, the first time an agent wants to use an app on your PC it asks: “Let the agent use …?”. You can allow it once or ${ui('Always allow')}. Always-allowed and denied apps are listed in Settings › Computer use.`)}
${h2('never', 'Things that always wait for you')}
${p('Approvals, permission requests, destructive actions, sign-ins, payments and messages sent outside are never continued for you, even by features that keep work going on their own.')}
${h2('coordinator', 'With the Coordinator')}
${p('The Coordinator’s agents follow the same rules. Their requests come to you with Allow and Deny. See <a href="/docs/projects/coordinator/#needs-you">When it needs you</a>.')}`,
    },
    {
      slug: 'agents/undo',
      nav: 'Undo changes',
      title: 'Undo an agent’s changes',
      seoTitle: 'Undo an AI agent’s file changes',
      description: 'Every turn records which files changed. Undo the whole turn in one click, redo it, or discard single changes in the Changes pane.',
      body: `
${p('Before an agent changes files, Codevalanche saves how they were. After the turn you get a record of what changed and a way back.')}
${h2('turn-changes', 'Turn changes')}
${p(`Each turn that changed files shows a ${ui('Turn changes')} card: ${ui('Turn in progress')} while it works, then ${ui('Saved')} with the number of changed files.`)}
${steps([
  [`Choose ${ui('Undo this turn’s changes')}.`, ''],
  ['Confirm.', 'The files go back to how they were before the agent changed them.'],
  [`Changed your mind? Choose ${ui('Redo')}.`, ''],
])}
${h2('unavailable', 'When undo is not offered')}
${table([
  ['Files not shown on the card', 'The operation includes files outside this turn’s record.'],
  ['Another turn', 'The change belongs to a different turn.'],
  ['Incomplete record', 'The complete earlier state of the files was not captured.'],
  ['Very large folder', 'A folder too large to snapshot runs without undo; the app tells you.'],
], ['Reason', 'Meaning'])}
${p('If the app closes during a turn, the record is recovered on the next start (“Interrupted turn recovered”).')}
${h2('git', 'Fine-grained changes')}
${p(`The ${ui('Changes')} pane (${keys('Ctrl', '2')}) shows each changed file. You can discard a single change (a hunk) or a whole file. Discarding cannot be undone, so the app asks first.`)}
${tip('Projects in git give you a second safety net: every change is also visible in git, and the Coordinator merges agents’ branches only when it is safe.')}
${h2('space', 'Disk space')}
${p('Undo snapshots are kept with the AI tools’ sessions. Settings › Storage shows how much space they use.')}`,
    },
    {
      slug: 'agents/steering',
      nav: 'Steer and queue messages',
      title: 'Steer the agent and queue messages',
      seoTitle: 'Steer a running AI agent and queue follow-ups',
      description: 'Send follow-ups while an agent works. They wait in a queue, can be edited, moved to the front or sent into the running turn.',
      body: `
${p('You do not have to wait for an agent to finish. Write your next message whenever you think of it.')}
${h2('queue', 'The queue')}
${list([
  'A message sent while the agent works joins the queue under the message box.',
  'Queued messages run one after another when the current run finishes.',
  'You can edit a queued message, move it to the front so it runs next, remove it, or clear the whole queue.',
  'If an earlier message failed, the queue waits so nothing runs out of order.',
])}
${h2('steer', 'Steer the running turn')}
${p('Some AI apps can take a message into the turn that is already running. Then a queued follow-up can be sent straight in to change direction. If the app cannot confirm it arrived, the message is held and you choose Send again or Discard.')}
${h2('stop', 'Stop')}
${p(`${keys('Esc')} in the message box stops the run. Queued messages stay queued.`)}`,
    },
    {
      slug: 'agents/side-chats',
      nav: 'Side chats, forks and handoffs',
      title: 'Side chats, forks and handoffs',
      seoTitle: 'Side chats, conversation forks and handoffs between agents',
      description: 'Ask a quick question in a side chat, fork a conversation from any message, or hand the work to another agent without losing context.',
      body: `
${h2('side-chat', 'Side chat')}
${p(`A side chat opens beside the main conversation (${keys('Ctrl', '5')}). It starts as a copy: the agent knows the conversation up to the copy, and what you write there stays there. It works on the same project files.`)}
${list([
  `${ui('Read what’s new in main')} brings the side chat up to date with the main conversation.`,
  'You can send a side chat’s answer back to the main conversation.',
])}
${h2('fork', 'Fork a conversation')}
${p('Use “Fork from here” on a message to start a new conversation from that point. The new one is marked “Forked from …” so you can always find where it came from.')}
${h2('handoff', 'Hand off to another agent')}
${p(`${ui('Hand off to another agent')} moves the work to a different agent, for example from Codex to Claude Code when one runs out of limit.`)}
${steps([
  ['The current agent stops first.', ''],
  ['Review the handoff.', 'It lists the agent’s updates and the files it touched. Edit it and describe what is left.'],
  ['Choose where to continue:', `${ui('Continue in this thread')} or ${ui('Continue in a new thread')}. The next agent starts in the same checkout.`],
])}
${note('Save or discard your unsaved file edits, and send or clear your message, before handing off.')}`,
    },
    {
      slug: 'agents/voice',
      nav: 'Voice conversation',
      title: 'Voice: dictation and voice conversation',
      seoTitle: 'Talk to your AI coding agent: dictation and voice mode',
      description: 'Dictate messages with speech recognition on your PC or your own cloud key, and talk hands-free with the agent in voice mode, with natural voices.',
      body: `
${p('Codevalanche can turn your voice into text, and in voice mode it can talk back.')}
${h2('dictation', 'Dictation')}
${p('Press the microphone in the message box, speak, and the text appears in the box for you to check before sending. With hold to record, press and hold the microphone to talk and let go to stop. A voice note can be up to 5 minutes.')}
${h2('where', 'Where your voice is turned into text')}
${table([
  [ui('On this computer'), 'Private and works offline. Needs a speech engine, downloaded once in Settings › Voice.'],
  [ui('Groq (cloud, faster)'), 'Uses your own Groq key.'],
  [ui('OpenAI (cloud)'), 'Uses your own OpenAI key. Only while an OpenAI model is selected.'],
], ['Option', 'What it means'])}
${p(`${ui('If this computer can’t, use my cloud key instead')} sends speech to Groq, then OpenAI, only when no speech engine is installed here.`)}
<h3 id="engines">Speech engines on your PC</h3>
${table([
  [ui('Balanced'), 'The best speed-to-accuracy trade-off. Start here.'],
  [ui('Most accurate'), 'Slower; worth it when the balanced engine keeps missing words.'],
  [ui('Light'), 'For older machines, or when disk space matters more than accuracy.'],
], ['Engine', 'When to use it'])}
${p(`They understand 99 languages. ${ui('Language you speak')} can stay on ${ui('Detect automatically')}. Engines are downloaded only after their checksum is verified.`)}
${h2('voice-mode', 'Voice conversation')}
${p(`Voice mode lets you talk with the agent hands-free. Start or stop it with ${keys('Ctrl', 'Shift', 'Space')} from anywhere in the app, except inside a terminal.`)}
${list([
  'You speak; a short pause ends your turn. You can set how long that pause is.',
  `${ui('Read replies aloud')} reads the agent’s answers.`,
  `${ui('Natural voices')} (female and male, English) are generated on this computer. Download them once to use them offline; reply audio stays on this computer.`,
  'Voice conversation needs a Claude Code model.',
])}
${h2('microphone', 'Microphone')}
${p('Choose the microphone from the voice menu. If it does not open, check that Windows allows the app to use it: Windows Settings › Privacy › Microphone.')}`,
    },
    {
      slug: 'agents/automations',
      nav: 'Automations',
      title: 'Automations',
      seoTitle: 'Automations: scheduled AI agent tasks on your PC',
      description: 'Schedule agent tasks such as dependency checks or test runs. Learn how runs, retries, missed runs and reviews work.',
      body: `
${p('An automation runs an agent task on a schedule in a project: check outdated dependencies every Monday, add tests to new files, summarize a branch.')}
${h2('create', 'Create an automation')}
${steps([
  ['Open the project’s automations.', ''],
  ['Give it a name and instructions.', 'Write the task as you would in a message. Starters are offered, for example adding focused tests or updating dependencies in small groups.'],
  ['Choose the model and the permission mode.', 'Both are required. With a mode that asks, runs stop and wait for your approval before each change.'],
  ['Set the schedule.', ''],
])}
${note('Local automations run while Codevalanche is open and this computer is awake. An automation stays in the project where it was created.')}
${h2('runs', 'Runs')}
${table([
  ['Run history', 'Every run with its result. A run that proposed a change waits for your review in its conversation.'],
  ['Retries', 'A failed run can be retried automatically (“Attempt 2 of 3”). After repeated failures the automation cools down for a while.'],
  ['Missed runs', 'If the computer was off, missed runs are either skipped or caught up once, as you choose.'],
  ['Skipped', 'A run is skipped when the previous one is still running, or another automation is running.'],
  ['Pause', 'A paused automation does not run, and its scheduled retry does not either.'],
])}
${p('Only a failed or canceled run can be retried. A run waiting for your review is yours to decide.')}`,
    },
    {
      slug: 'agents/computer-use',
      nav: 'Computer use',
      title: 'Computer use',
      seoTitle: 'Computer use: let agents see and use apps on your PC',
      description: 'Let an agent see and use approved app windows on your PC. Each app asks first; browsers are view-only and terminals click-only.',
      body: `
${p('With Computer use an agent can see and control app windows you approve, for example to check that your app really works.')}
${h2('how', 'How it asks')}
${p('The first time the agent wants to use an app, it asks in the conversation: “Let the agent use …?”. If you allow it, it can see that app and click and type in it until the task ends.')}
${table([
  ['Most apps', 'The agent can see, click and type.'],
  ['Browsers', 'View-only: it can see the app but cannot click or type in it.'],
  ['Terminals and code editors', 'Click-only: it can see and click, but cannot type.'],
], ['App', 'What the agent may do'])}
${warn(`Press ${keys('Esc')} at any time to stop it.`)}
${h2('rules', 'Always-allowed and denied apps')}
${p('Settings › Computer use lists the apps you always allowed and the apps you denied. Remove a rule and the agent asks you again next time.')}
${note('Computer use is not offered through Gemini CLI.')}`,
    },
    {
      slug: 'agents/plugins',
      nav: 'Plugins, MCP and skills',
      title: 'Plugins, MCP servers and skills',
      seoTitle: 'Plugins, MCP servers and skills for AI coding agents',
      description: 'Give agents more abilities with MCP servers, skills and connectors such as GitHub, Figma, Google Drive and Vercel, or import them from Claude Code and Codex.',
      body: `
${p(`${ui('Plugins')} in Settings collects the MCP servers, skills and built-in capabilities agents can use. One list serves every agent.`)}
${h2('catalog', 'The catalog')}
${table([
  ['GitHub', 'Issues, pull requests, code search and Actions on GitHub.'],
  ['Figma', 'Design context, screenshots, variables and assets from Figma files.'],
  ['Google Drive and Gmail', 'Search and read files and mail through Google’s hosted MCP servers.'],
  ['Vercel', 'Projects, deployments, logs and docs from your Vercel account.'],
  ['Supabase', 'Explore your database. Changes need your approval.'],
  ['Skills', 'Code review, frontend design, data analysis, spreadsheets, deep research and more.'],
], ['Plugin', 'What it adds'])}
${p('Connectors that need an account sign in through the service’s own page.')}
${h2('import', 'Import from Claude Code and Codex')}
${p('If you already set up MCP servers in Claude Code or Codex, import them so every agent can use them. You can undo the import from the same page any time; Claude Code and Codex then go back to their own lists. Servers you add later in Claude Code are used here only after you import again.')}`,
    },
  ],
};
