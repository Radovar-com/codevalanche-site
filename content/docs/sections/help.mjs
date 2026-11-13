import { faq, h2, keys, list, note, p, steps, table, tip, ui } from '../kit.mjs';

const fix = rows => table(rows, ['What you see', 'What to do']);

export default {
  title: 'Troubleshooting',
  pages: [
    {
      slug: 'troubleshooting',
      nav: 'Fix a problem',
      title: 'Fix a problem',
      seoTitle: 'Troubleshooting Codevalanche',
      description: 'Find the fix for install, update, AI connection, local model and agent problems, read error codes and send a report that helps.',
      body: `
${p('Most messages in Codevalanche say what went wrong and what to do next. Start with the area of the problem:')}
${list([
  '<a href="/docs/troubleshooting/install-and-updates/">Install and updates</a>',
  '<a href="/docs/troubleshooting/ai-connections/">AI connections and sign-in</a>',
  '<a href="/docs/troubleshooting/local-models/">Local models and voice</a>',
  '<a href="/docs/troubleshooting/agents/">Agents and runs</a>',
])}
${h2('codes', 'Error codes')}
${p('Many messages end with a code such as <code>CV-VOICE-E07</code>. The middle part says where the problem is:')}
${table([
  ['CV-VOICE', 'Dictation, speech engines and voice mode'],
  ['CV-BROWSER', 'The built-in Browser pane'],
  ['CV-PR', 'Publishing to GitHub (branches and pull requests)'],
  ['CV-IMPORT', 'Importing conversations'],
  ['CV-CHAT', 'Conversations and side chats'],
  ['CV-LIMITS, CV-USAGE', 'Usage limits'],
  ['CV-RUN', 'Agent runs'],
  ['CV-DIAGNOSTICS', 'Creating a diagnostic pack'],
], ['Code', 'Area'])}
${p('Include the code when you ask for help.')}
${h2('diagnostics', 'Diagnostics')}
${p('Some messages suggest opening Diagnostics. It shows technical details and can create a diagnostic pack you can attach to a report. Diagnostics stay on your computer unless you send them.')}
${h2('report', 'Report a problem')}
${steps([
  [`Open Settings › ${ui('Send feedback')}.`, 'Choose a category and describe what you did, what you expected and what happened.'],
  ['Review the text.', 'Any prefilled diagnostics are shown in the text before you send. Keys, tokens, email addresses and personal folder paths are removed.'],
  ['Tick the consent box and send.', 'You can also copy or save the report locally instead.'],
])}
${p('You can also write to <a href="mailto:info@radovar.com" data-contact-id="info">info@radovar.com</a>. Remove keys and private project content from screenshots and logs.')}`,
    },
    {
      slug: 'troubleshooting/install-and-updates',
      nav: 'Install and updates',
      title: 'Install and update problems',
      seoTitle: 'Fix Codevalanche install and update problems',
      description: 'Fixes for SmartScreen, a failed install, an update that does not download or does not match its checksum, and a full disk.',
      body: `
${h2('install', 'Installing')}
${fix([
  ['Windows protected your PC (SmartScreen)', `Choose ${ui('More info')}, then ${ui('Run anyway')}.`],
  ['The installer does not start', 'Check that you are on Windows 11, 64-bit, and that the download finished. Download it again from the <a href="/download/">download page</a>.'],
  ['Only a little space left on the drive', 'Free some space. Settings › Storage shows what Codevalanche uses.'],
])}
${h2('updates', 'Updating')}
${fix([
  ['The update feed could not be reached', 'Check your connection and try again. Nothing was downloaded and the installed app is unchanged.'],
  ['The connection was lost', 'Retry. The verified partial download was kept and resumes.'],
  ['The downloaded installer did not match the checksum', 'It was quarantined and will not be installed. Download it again.'],
  ['Staged update needs attention', 'Clear the staged update and download again. Clearing leaves the installed app unchanged.'],
  ['No update has been published yet', 'You have the latest version.'],
])}
${h2('start', 'Starting')}
${fix([
  ['Codevalanche does not open after an update', 'Restart Windows and open it from the Start menu. If it still does not open, write to us with what you see (see <a href="/docs/troubleshooting/#report">Report a problem</a>).'],
])}`,
    },
    {
      slug: 'troubleshooting/ai-connections',
      nav: 'AI connections',
      title: 'AI connection and sign-in problems',
      seoTitle: 'Fix Claude Code, Codex and API key connection problems',
      description: 'Fixes for agents that are not detected, sign-ins that do not finish or expire, API keys that are refused and limits that do not show.',
      body: `
${h2('agents', 'Agent apps')}
${fix([
  [`${ui('Agent is missing')} / Claude Code not found`, 'Install it from AI apps on this PC (Codevalanche can install Claude Code), or install it yourself, then check again.'],
  [ui('Sign-in required'), 'The app is installed but not signed in. Sign in, then re-run the check.'],
  ['Its saved sign-in no longer works', `Select ${ui('Sign in')} to sign in again.`],
  [ui('Update required'), 'The installed version is too old. Update it from AI apps on this PC, then check again.'],
  ['Close any terminal or app that is using …', 'An update could not replace the app while it was in use. Close it and try again.'],
  ['Sign-in opened in a separate window', 'Finish there; the list checks again when you come back.'],
  ['The browser does not open for sign-in', 'Sign in with a code on another device.'],
])}
${h2('keys', 'API keys')}
${fix([
  ['… did not accept this key', 'Paste a new key from your account with that provider.'],
  ['This format is shared by OpenAI and DeepSeek', 'Choose the provider from the list.'],
  ['We can’t tell which provider this key is for', 'Choose it from the list.'],
  ['Your OS secure storage isn’t available', 'Codevalanche refuses to store keys unprotected. Sign in to Windows normally and try again.'],
  ['The key was saved, but Codevalanche could not restart its AI connection', 'Restart Codevalanche, then set up this AI again.'],
])}
${h2('limits', 'Limits')}
${fix([
  ['Claude Code limits are not shown', 'They appear after your first message with Claude Code.'],
  ['Codex limits are not shown', 'Sign in to Codex in Your AIs.'],
  ['Couldn’t read the limits right now (CV-LIMITS-001)', 'Try again later; your work is not affected.'],
])}`,
    },
    {
      slug: 'troubleshooting/local-models',
      nav: 'Local models and voice',
      title: 'Local model and voice problems',
      seoTitle: 'Fix local AI model and voice dictation problems',
      description: 'Fixes for local models that do not download or start, a busy port, low memory, and speech engines or microphones that do not work.',
      body: `
${h2('models', 'Local models')}
${fix([
  ['Not enough disk space', 'Free some space. What downloaded so far is kept and the download resumes.'],
  ['Download interrupted, no connection', 'Retry; it resumes where it stopped.'],
  ['Another program is using Local AI’s port', 'Close other Codevalanche windows or development servers, then try again.'],
  ['Local AI couldn’t start on this PC', 'Restart Codevalanche; if it keeps happening, reinstall it. Your models and downloads are untouched.'],
  ['The memory requirements might exceed your machine', 'Choose a smaller model or file; the app marks what fits.'],
  ['This model can’t start on this computer yet', 'Remove it to free the space, or use a cloud AI instead.'],
  ['This file publishes no SHA-256 digest', 'Codevalanche never downloads without one. Choose another file.'],
])}
${h2('servers', 'LM Studio and local servers')}
${fix([
  ['The local server’s address is not valid', 'Check it under Your AIs.'],
  ['This local server can’t be used with this AI app', 'Choose another server or model.'],
])}
${h2('voice', 'Voice')}
${fix([
  ['Voice mode needs a speech engine', 'Download a speech engine in Settings › Voice, or add your own Groq or OpenAI key.'],
  ['The microphone did not open', 'Check Windows Settings › Privacy › Microphone, then try again.'],
  ['No speech was detected', 'Check the microphone in the voice menu and speak again.'],
  ['Voice conversation needs Claude Code (CV-VOICE-D03)', 'Choose a Claude Code model, then start voice mode again.'],
  ['Not enough disk space to download this speech engine (CV-VOICE-E07)', 'Free some space on the drive that holds your models.'],
])}`,
    },
    {
      slug: 'troubleshooting/agents',
      nav: 'Agents and runs',
      title: 'Agent and run problems',
      seoTitle: 'Fix AI agent runs that stop, wait or fail',
      description: 'What to do when an agent waits, stops, hits a limit, cannot use a model or the Coordinator does not start.',
      body: `
${h2('common', 'Common problems')}
${fix([
  [ui('Waiting for your approval'), 'Open the conversation and answer the approval card. Waiting is not a stalled agent.'],
  ['Terminal command was denied. No command was run.', 'Allow it if you want it to run, or tell the agent another way.'],
  [ui('Waiting for limit'), 'The AI’s limit was reached. It continues after the reset if that is on, or continue with another account or model.'],
  ['No app on this computer can run this model yet', 'Install or sign in to the app that runs it in Your AIs.'],
  ['The selected model can’t read the attached files', 'Remove the files or choose another model.'],
  ['Permissions unavailable', 'Select the permission button in the message box to read the modes again.'],
  ['This conversation is archived', 'Restore it from Archived chats to continue.'],
  [ui('No AI is connected'), 'The Coordinator starts once you connect an AI in Your AIs.'],
  ['The coordinator did not start', 'Check in Your AIs that you are connected, then try again.'],
  ['An agent of the Coordinator went silent', 'The Coordinator nudges it, then restarts it once. If it is still silent, it waits for you.'],
])}
${h2('stop', 'Stop a run')}
${p(`${keys('Esc')} in the message box stops a run at any time. Your queued messages stay queued.`)}`,
    },
    {
      slug: 'faq',
      nav: 'Questions',
      title: 'Questions',
      seoTitle: 'Codevalanche questions and answers',
      description: 'Answers to common questions about Codevalanche: which AIs work, privacy, local models, the Coordinator, limits, languages and Mac support.',
      body: `
${p('Short answers, with links to the full page.')}
${faq([
  ['What is Codevalanche?', 'A Windows app where AI coding agents such as Claude Code, Codex and Gemini CLI, or models on your own PC, work on your code with the same approvals, history and undo.'],
  ['Which AIs can I use?', 'Claude Code, Codex, Gemini CLI, ZCode, OpenCode, Grok Build, Kimi Code and Pi, API keys from Anthropic, OpenAI, Google, DeepSeek, Z.ai, xAI, Moonshot and Meta, and local models. See <a href="/docs/your-ais/">Connect your AIs</a>.'],
  ['Do I need to pay for AI separately?', 'You use your own AI accounts, keys or local models. Codevalanche does not resell AI access.'],
  ['Does my code go to Codevalanche?', 'No. It goes straight from your PC to the AI you chose, or stays on your PC with a local model. See <a href="/docs/privacy/">Where your code goes</a>.'],
  ['Can I work offline?', 'Yes, with local models and the speech engine on your PC.'],
  ['Can I use several Claude or ChatGPT accounts?', 'Yes. See <a href="/docs/your-ais/multiple-accounts/">Several accounts</a>.'],
  ['What does the Coordinator do?', 'It takes one goal, splits it into tasks for several agents, checks their work and asks you only when needed. See <a href="/docs/projects/coordinator/">The Coordinator</a>.'],
  ['Can an agent break my project?', 'Agents ask before actions you have not allowed, and each turn can be undone. See <a href="/docs/agents/approvals/">Approvals</a> and <a href="/docs/agents/undo/">Undo</a>.'],
  ['Which languages does the app speak?', '17. See <a href="/docs/app/languages/">Languages</a>.'],
  ['Is there a Mac version?', 'Not yet. Codevalanche runs on Windows 11.'],
])}`,
    },
  ],
};
