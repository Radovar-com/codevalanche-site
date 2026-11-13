import { faq, h2, list, note, p, steps, table, tip, ui, warn } from '../kit.mjs';

export default {
  title: 'Your AIs',
  pages: [
    {
      slug: 'your-ais',
      nav: 'Connect your AIs',
      title: 'Connect your AIs',
      seoTitle: 'Connect Claude Code, Codex, Gemini CLI and API keys',
      description: 'Connect the AIs you already pay for: sign in with a subscription, paste an API key, add agents from the public ACP catalog, or use models on your PC.',
      body: `
${p(`Everything that does the thinking is set up in ${ui('Your AIs')}. Codevalanche uses your own accounts and keys; it does not resell AI access. What you connect here appears in the model picker of every conversation.`)}
${h2('three-ways', 'Three ways to connect')}
${table([
  [ui('With your subscription or account'), 'Sign in through the official flow of the AI app: Claude Code for a Claude subscription, Codex for ChatGPT, ZCode for a Z.ai Coding Plan, and others.'],
  [ui('With an API key'), 'Paste a key from Anthropic, OpenAI, Google, DeepSeek, Z.ai, xAI, Moonshot or Meta, or connect an OpenAI-compatible cloud API.'],
  [ui('More agents from the public ACP catalog'), 'Install more agent programs from the public catalog of the open ACP standard.'],
], ['Way in', 'What it means'])}
${p('Models that run on your own computer are set up separately, in <a href="/docs/local-models/">Local models</a>.')}
${h2('pc-apps', 'AI apps on this PC')}
${p(`Agents such as Claude Code or Gemini CLI are programs on your computer. ${ui('AI apps on this PC')} lists which ones are installed, their version, whether you are signed in and whether an update is available. From there you can install a missing app, update one, or open its sign-in.`)}
${table([
  ['Codex', 'Included with Codevalanche. Updates automatically.'],
  ['Claude Code', 'Installed separately. Codevalanche can install it for you, then you press Sign in.'],
  ['Gemini CLI', 'Installed separately.'],
  ['ZCode', 'Installed separately, with the official ZCode install guide and sign-in steps.'],
  ['OpenCode, Grok Build, Kimi Code, Pi', 'Added from the agent catalog.'],
], ['Agent', 'How it gets on your PC'])}
${h2('statuses', 'What the connection states mean')}
${table([
  [ui('Agent is missing'), 'The program is not installed on this PC.'],
  [ui('Sign-in required'), 'Installed, but no signed-in session was found. Sign in again.'],
  [ui('Update required'), 'The installed version is too old for Codevalanche. Update it, then check again.'],
  [ui('Account verified'), 'Signed in and confirmed.'],
  [ui('Models discovered'), 'The AI reported which models you can use.'],
  [ui('Disabled for new runs'), 'You turned it off. Conversations already running are not affected.'],
])}
${h2('choose', 'Choosing a model in a conversation')}
${p(`The model picker in the message box lists the models of every connected AI. You can hide models you never use. New conversations start on the default you choose; conversations you already have keep their model.`)}
${tip(`Use ${ui('Disable for new runs')} to take an AI out of use without signing out. Turn it back on with ${ui('Enable for new runs')}.`)}
${h2('pages', 'Step-by-step guides')}
${list([
  '<a href="/docs/your-ais/claude-code/">Claude Code</a>',
  '<a href="/docs/your-ais/codex/">Codex</a>',
  '<a href="/docs/your-ais/gemini-cli/">Gemini CLI</a>',
  '<a href="/docs/your-ais/other-agents/">ZCode, OpenCode, Grok Build, Kimi Code and Pi</a>',
  '<a href="/docs/your-ais/api-keys/">API keys</a>',
  '<a href="/docs/your-ais/multiple-accounts/">Several accounts for one AI</a>',
  '<a href="/docs/your-ais/usage-limits/">Usage limits</a>',
])}`,
    },
    {
      slug: 'your-ais/claude-code',
      nav: 'Claude Code',
      title: 'Claude Code',
      seoTitle: 'Use Claude Code in Codevalanche on Windows',
      description: 'Install Claude Code, sign in with your Claude subscription, choose permission modes and use Claude Code with projects and the Coordinator.',
      body: `
${p('Claude Code is Anthropic’s app that runs your Claude subscription on your computer. Codevalanche starts Claude Code with your own sign-in, so your Claude plan and its limits apply as usual.')}
${h2('install', 'Install and sign in')}
${steps([
  ['Open Your AIs.', `Find Claude in ${ui('With your subscription or account')}.`],
  ['Install Claude Code if it is missing.', 'If it is not on this computer, Codevalanche offers to install it.'],
  [`Press ${ui('Sign in')}.`, 'Finish the official Claude sign-in in your browser. If the browser does not open on this PC, you can sign in with a code on another device.'],
  ['Check the state.', `When it shows ${ui('Account verified')}, Claude models appear in the model picker.`],
])}
${note('Prefer an API key? Choose the Anthropic API key option instead. See <a href="/docs/your-ais/api-keys/">API keys</a>.')}
${h2('permissions', 'Permission modes')}
${p('Claude Code has its own permission modes. Codevalanche reads them from Claude Code and shows them in the permission button of the message box:')}
${table([
  [ui('Manual'), 'Always asks before making changes.'],
  [ui('Auto'), 'Claude handles permission decisions.'],
  [ui('Accept edits'), 'Accepts file edits automatically and still asks for the rest.'],
  [ui('Plan'), 'Creates a plan before making changes.'],
  [ui('Don’t ask'), 'Proceeds without asking for permission.'],
  [ui('Bypass permissions'), 'Accepts all permissions. Use only in folders where that is safe.'],
], ['Mode', 'What Claude Code does'])}
${p('More in <a href="/docs/agents/approvals/">Approvals and permissions</a>.')}
${h2('folder-rules', 'Rules saved in the project folder')}
${p(`Claude Code can read a <code>CLAUDE.md</code> file and the commands saved in a project folder. In Project settings, ${ui('Claude can read the rules in the project folder')} turns this on. Turn it on only for folders you trust.`)}
${h2('voice', 'Voice conversation')}
${p('Voice conversation uses Claude Code. See <a href="/docs/agents/voice/">Voice conversation</a>.')}
${h2('limits', 'Limits')}
${p('Claude Code reports its limits only while it works, so they appear after your first message. See <a href="/docs/your-ais/usage-limits/">Usage limits</a>.')}
${faq([
  ['Does Codevalanche see my Claude password?', 'No. You sign in through Claude’s own flow in your browser.'],
  ['Can I use two Claude accounts?', 'Yes. See <a href="/docs/your-ais/multiple-accounts/">Several accounts</a>.'],
  ['Claude Code says the saved sign-in no longer works.', `Select ${ui('Sign in')} again in Your AIs, then check again.`],
])}`,
    },
    {
      slug: 'your-ais/codex',
      nav: 'Codex',
      title: 'Codex',
      seoTitle: 'Use OpenAI Codex with your ChatGPT account in Codevalanche',
      description: 'Codex is included with Codevalanche. Sign in with ChatGPT or an OpenAI API key, pick a permission mode and see your plan limits.',
      body: `
${p('Codex is OpenAI’s coding agent. It is included with Codevalanche, so there is nothing else to install, and it updates automatically while it is idle.')}
${h2('sign-in', 'Sign in')}
${steps([
  ['Open Your AIs.', 'Find OpenAI.'],
  [`Choose ${ui('Sign in with ChatGPT')}.`, 'Finish the official sign-in in your browser. You can also sign in with a code on another device.'],
  ['Or use an API key.', 'Choose the OpenAI API key option. See <a href="/docs/your-ais/api-keys/">API keys</a>.'],
])}
${h2('permissions', 'Permission modes')}
${table([
  [ui('Read only'), 'Reads the project but cannot change any file.'],
  [ui('Ask for approval'), 'Asks you before actions.'],
  [ui('Approve for me'), 'Only asks for actions detected as potentially unsafe.'],
  [ui('Edit project, never ask'), 'Changes files and runs commands in the project without asking; never asks for more.'],
  [ui('Full access'), 'Unrestricted access to the internet and any file on your computer.'],
], ['Mode', 'What Codex may do'])}
${p('With some modes Codex’s own automatic reviewer decides on requests; a request it refuses is shown as “Denied by Codex’s automatic reviewer”, with the reason.')}
${h2('limits', 'Plan limits and saved resets')}
${p(`Codevalanche shows how much of your Codex plan is left and when it resets. If your plan has saved resets, they are listed with their expiry date. You decide when to use one: in Codex with <code>/usage</code>, or from ${ui('Your AIs')}. Codevalanche never uses them for you. See <a href="/docs/your-ais/usage-limits/">Usage limits</a>.`)}
${h2('updates', 'Updates')}
${p(`Codex updates in the background while idle. If an update is waiting, the app shows ${ui('Update staged')}; restart Codevalanche to use it.`)}`,
    },
    {
      slug: 'your-ais/gemini-cli',
      nav: 'Gemini CLI',
      title: 'Gemini CLI',
      seoTitle: 'Use Gemini CLI in Codevalanche',
      description: 'Install Gemini CLI, sign in with your Google account, choose its permission mode and use Gemini models in Codevalanche.',
      body: `
${p('Gemini CLI is Google’s coding agent. Install it on your computer, sign in, and Codevalanche detects it in AI apps on this PC.')}
${h2('setup', 'Set it up')}
${steps([
  ['Install Gemini CLI.', 'Follow Google’s official instructions. Codevalanche shows it as missing until it is installed.'],
  ['Sign in.', 'Sign in with your Google account, then check again in Your AIs.'],
  ['Pick a Gemini model', 'in the model picker of a conversation.'],
])}
${h2('permissions', 'Permission modes')}
${table([
  [ui('Default'), 'Prompts for approval.'],
  [ui('Auto edit'), 'Auto-approves edit tools.'],
  [ui('Plan'), 'Read-only mode.'],
  [ui('YOLO'), 'Auto-approves all tools.'],
], ['Mode', 'What Gemini CLI does'])}
${h2('limits', 'Limits')}
${p('According to Google, the plan allows a set number of requests per day. Gemini CLI does not share its exact limits with other apps, so Codevalanche links to Google’s usage page.')}
${note('Some features use their own connection: Computer use stays off for Gemini CLI, and a Gemini key can be used directly as an API key. See <a href="/docs/your-ais/api-keys/">API keys</a>.')}`,
    },
    {
      slug: 'your-ais/other-agents',
      nav: 'ZCode, OpenCode, Grok Build, Kimi Code, Pi',
      title: 'ZCode, OpenCode, Grok Build, Kimi Code and Pi',
      seoTitle: 'ZCode, OpenCode, Grok Build, Kimi Code and Pi agents',
      description: 'Use ZCode with a Z.ai Coding Plan and add OpenCode, Grok Build, Kimi Code, Pi or any agent from the public ACP catalog.',
      body: `
${h2('zcode', 'ZCode (Z.ai Coding Plan)')}
${p('ZCode uses your Z.ai account and its GLM models. It is installed separately.')}
${steps([
  [`${ui('Open ZCode install guide')}.`, 'Codevalanche opens the official guide.'],
  [`${ui('Open ZCode sign-in steps')}.`, 'Sign in to the Z.ai Coding Plan inside ZCode.'],
  ['Check again', 'in AI apps on this PC.'],
])}
${p('According to Z.ai, the plan has a 5-hour limit and a weekly limit.')}
${h2('catalog-agents', 'OpenCode, Grok Build, Kimi Code and Pi')}
${p('These agents come from the agent catalog. Pick one, install it, then sign in to it.')}
${table([
  ['Grok Build', 'xAI’s agent. xAI does not publish fixed limits for Grok Build.'],
  ['Kimi Code', 'Moonshot’s agent. According to Kimi, the plan has a rolling 5-hour limit and a monthly total; older plans also have a weekly limit.'],
  ['OpenCode', 'An agent that works with many model providers.'],
  ['Pi', 'A minimal coding agent.'],
])}
${h2('acp', 'More agents from the public ACP catalog')}
${p(`ACP is an open standard that lets any agent program work in Codevalanche. ${ui('Public agent catalog')} lists agents published by others. These agents are made by other publishers and do not receive your keys.`)}
${list([
  'An agent is installed only with a publisher checksum. If the download does not match it, nothing is installed.',
  'Some agents need Node.js / npm or uv on your computer; the app tells you which.',
  `${ui('Refresh catalog')} loads the latest list.`,
])}
${warn('Installing from the catalog runs a program from a third-party publisher on your computer. Install only agents you trust.')}
${h2('manual', 'Add an agent by hand')}
${p(`${ui('Manual agent (ACP)')} connects any ACP agent: choose its executable, then enter arguments and settings as JSON. Keep API keys in Your AIs, never in these fields.`)}`,
    },
    {
      slug: 'your-ais/api-keys',
      nav: 'API keys',
      title: 'API keys',
      seoTitle: 'Use API keys from Anthropic, OpenAI, DeepSeek, Z.ai, xAI and more',
      description: 'Paste an API key from Anthropic, OpenAI, Google, DeepSeek, Z.ai, xAI, Moonshot or Meta. Keys are encrypted on your computer.',
      body: `
${p('An API key lets you use a provider’s models and pay that provider directly. Codevalanche never sees your bill.')}
${h2('add', 'Add a key')}
${steps([
  ['Open Your AIs.', ''],
  [`Paste the key into ${ui('Paste any API key and we detect the provider')}.`, 'Codevalanche recognizes most providers from the key. If a format is shared (OpenAI and DeepSeek use the same one), choose the provider.'],
  ['Wait for the models.', 'Your models show up as soon as the key works.'],
])}
${h2('providers', 'Providers you can use with a key')}
${table([
  ['Anthropic', 'Claude models.'],
  ['OpenAI', 'GPT models.'],
  ['Google', 'Gemini models.'],
  ['DeepSeek', 'DeepSeek chat and reasoning models.'],
  ['Z.ai', 'GLM text models, and agents through Claude Code.'],
  ['Moonshot', 'Kimi models, and agents through Claude Code.'],
  ['xAI', 'Grok models.'],
  ['Meta', 'Muse models, and agents through Codex.'],
  ['OpenAI-compatible cloud API', 'Any cloud endpoint with Bearer authentication and Chat Completions. Text chat only.'],
], ['Provider', 'What you get'])}
${h2('security', 'How keys are kept')}
${list([
  'Keys are encrypted with your Windows secure storage and saved only in the desktop app on this computer.',
  'If secure storage is not available, Codevalanche refuses to save the key rather than store it unprotected.',
  'After saving, a key is hidden; only its last four characters and the date are shown.',
  'Saving or removing a key restarts Codevalanche’s AI connection and stops any AI request in progress.',
])}
${note('Removing a key in Codevalanche does not remove a key you set somewhere else, for example in an environment file.')}
${h2('several', 'Several keys')}
${p(`Use ${ui('Add another account or key')} to add a second key for the same provider, for example one for work and one for personal projects. See <a href="/docs/your-ais/multiple-accounts/">Several accounts</a>.`)}`,
    },
    {
      slug: 'your-ais/multiple-accounts',
      nav: 'Several accounts',
      title: 'Several accounts for one AI',
      seoTitle: 'Use several Claude or ChatGPT accounts in one app',
      description: 'Add more than one account or key for the same AI, give each a name you recognize, and choose which one a conversation uses.',
      body: `
${p('Many people have more than one account: a work and a personal Claude plan, two ChatGPT accounts, or several API keys. Codevalanche keeps them side by side.')}
${h2('add', 'Add another account')}
${steps([
  ['Open Your AIs', 'and pick the AI.'],
  [`Choose ${ui('Add another account or key')}.`, 'Sign in with the other account, or paste the other key.'],
  ['Name it.', `${ui('Connection name')} is optional, but a name such as “Work” helps you recognize it.`],
])}
${note('Some AIs do not support a second account in the same place; the app then says “This connection does not support another account here.”')}
${h2('use', 'Choose which account works')}
${p('The model picker shows models per account, so you choose the account together with the model. Each conversation keeps the account it started with.')}
${h2('limits', 'Limits stay separate')}
${p('Each account has its own plan and its own limits. Moving work to another account is always your decision.')}
${h2('remove', 'Remove an account')}
${p('Removing a connection makes Codevalanche forget it and its model choices. Your account with the provider and its chats stay as they are, and you can add it again any time.')}`,
    },
    {
      slug: 'your-ais/usage-limits',
      nav: 'Usage limits',
      title: 'Usage limits',
      seoTitle: 'See your Claude Code and Codex usage limits',
      description: 'See how much of your Codex and Claude Code plan is left and when it resets, get a warning when it runs low, and let work continue after a reset.',
      body: `
${p('Subscriptions come with limits, usually a 5-hour window and a weekly one. Codevalanche reads them from the official apps with your own sign-in and shows them in one place.')}
${h2('where', 'Where to see them')}
${p(`${ui('Settings')} › Limits shows <em>what is left of your Codex and Claude Code plan</em>: the percentage left for each window and when it resets, in your time zone. Each value says when it was checked; an old value is marked “may be out of date”.`)}
${list([
  'Claude Code reports its limits only while it works, so they appear after your first message.',
  'Codex limits appear once you are signed in to Codex in Your AIs.',
  'Other AIs (Z.ai, Kimi, Gemini, Grok Build) do not share their limits with other apps. Codevalanche shows what the provider publishes about the plan and links to its usage page.',
])}
${h2('warnings', 'Warnings')}
${p('When a limit runs low you get a warning such as “20% of your 5-hour limit is left. It resets today at 17:40.” A saved Codex reset that expires soon is also announced.')}
${h2('saved-resets', 'Saved Codex resets')}
${p('Some Codex plans include saved resets. Each one brings your limits back to full. They are listed with the date they expire. You choose when to use one; Codevalanche never uses them for you.')}
${h2('when-reached', 'When a limit is reached')}
${p(`Work that hits a limit shows ${ui('Waiting for limit')} and, where the setting is on, continues by itself when the limit resets. For the Coordinator’s agents this is ${ui('Continue on its own after the limit resets')} in <a href="/docs/projects/settings/">Project settings</a>.`)}
${tip('You can also continue right away with another account or model. That is always your choice; Codevalanche does not switch accounts behind your back.')}`,
    },
  ],
};
