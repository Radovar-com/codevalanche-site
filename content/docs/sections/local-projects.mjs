import { readFileSync } from 'node:fs';
import { faq, h2, keys, list, note, p, steps, table, tip, ui, warn } from '../kit.mjs';

const coordinatorBody = readFileSync(new URL('./coordinator.html', import.meta.url), 'utf8');

export const localModels = {
  title: 'Local models',
  pages: [
    {
      slug: 'local-models',
      nav: 'Run models on your PC',
      title: 'Run AI models on your own PC',
      seoTitle: 'Run local AI coding models offline on Windows',
      description: 'Download a model that fits your computer and run it on your PC. Your code and messages stay on this computer and it works without internet.',
      body: `
${p('Codevalanche has its own local AI engine. Models that run on this computer keep your code and messages here, and they work without internet once downloaded.')}
${h2('first-model', 'Get your first model')}
${steps([
  [`Open ${ui('Local models')}.`, 'In Settings, under models that run on this PC.'],
  ['Pick the recommended model.', 'Codevalanche recommends a model for your computer based on its memory and graphics card, and says why: for example “Already on this computer and fits in your 32 GB of memory”.'],
  ['Download it.', 'If the local AI engine is not set up yet, one click sets up both. The engine is downloaded once and checked before use.'],
  ['Choose it in a conversation.', 'Local models appear in the model picker like any other.'],
])}
${tip('You can keep working while a model downloads. The download continues after a restart, and if the connection drops it resumes from where it stopped.')}
${h2('discover', 'Find other models')}
${p(`${ui('Find a model')} searches public models. Each file says how it fits this computer:`)}
${table([
  ['Fits in the graphics card', 'The model might fit entirely in your GPU’s memory, which can make it much faster.'],
  ['Fits partly in the graphics card', 'Part of it runs on the GPU, the rest in normal memory.'],
  ['Fits in memory', 'It runs in your computer’s memory.'],
  ['Too large', 'It might need more than your computer has. Downloading it is not recommended.'],
], ['Label', 'Meaning'])}
${p(`Codevalanche downloads a model only when the publisher gives a SHA-256 checksum, and pins it to an exact version, so the files you run are the files that were checked. You can also add a <code>.gguf</code> file that is already on your PC with ${ui('Register a .gguf model file')}.`)}
${h2('default', 'The default model')}
${p('You can make a local model the default for new conversations. Commit messages and pull request text that Codevalanche writes also use it. Conversations you already have keep their model.')}
${h2('settings', 'Settings for people who tune models')}
${table([
  ['Context', 'How much text the model reads at once. The app shows the context this PC loads and the model’s maximum.'],
  ['Guardrails', 'Stops a model from loading if it could overload this PC: balanced, strict, or your own memory limit.'],
  ['Unload when idle', 'Frees memory after the model has not been used for a while.'],
  ['Longest answer', 'The longest single answer. A task that uses tools is never cut.'],
  ['Thinking', 'Automatic follows the model; On and Off fix it from the next answer.'],
])}
${p('The engine listens only on this computer (127.0.0.1) and is protected with a token.')}
${h2('space', 'Disk space')}
${p('Removing a model deletes its files from this PC; you can download it again any time. Models from an earlier version are shown separately; nothing is deleted automatically.')}
${faq([
  ['Are local models as good as cloud models?', 'They are smaller, so they suit focused tasks best. They are private, work offline and have no usage limits.'],
  ['Can local models read pictures?', 'Not yet in local runs.'],
  ['Can I use LM Studio instead?', 'Yes. See <a href="/docs/local-models/local-servers/">LM Studio and local servers</a>.'],
])}`,
    },
    {
      slug: 'local-models/local-servers',
      nav: 'LM Studio and local servers',
      title: 'LM Studio and other local servers',
      seoTitle: 'Use LM Studio and OpenAI-compatible local servers',
      description: 'Connect models you already run in LM Studio or another OpenAI-compatible server on your PC, and use them in Codevalanche conversations.',
      body: `
${p('If you already run models in LM Studio or another OpenAI-compatible server on your computer, Codevalanche can use them directly.')}
${h2('connect', 'Connect a local server')}
${steps([
  ['Start the server', 'in LM Studio (or your other server) and load a model.'],
  ['Open Your AIs.', `Codevalanche looks for ${ui('Local servers')} on this computer. Use ${ui('Refresh local servers')} to look again.`],
  ['Or enter the address.', `Type the server’s address in ${ui('Local server address')}.`],
  ['Pick its model', 'in the model picker of a conversation.'],
])}
${h2('problems', 'When it does not work')}
${table([
  ['The local server’s address is not valid.', 'Check the address under Your AIs, then try again.'],
  ['This local server can’t be used with this AI app.', 'Choose another server or model.'],
  ['Couldn’t check for local servers', 'Make sure the server is running, then refresh.'],
], ['Message', 'What to do'])}
${note('A server you left enabled but did not start is reported as unavailable; start it and send again.')}
${h2('cloud', 'OpenAI-compatible cloud APIs')}
${p(`A cloud endpoint is different: it is added as ${ui('OpenAI-compatible cloud API')} with your own key. It must be a public HTTPS address; local and private addresses are not accepted there. See <a href="/docs/your-ais/api-keys/">API keys</a>.`)}`,
    },
  ],
};

export const projects = {
  title: 'Projects',
  pages: [
    {
      slug: 'projects',
      nav: 'Projects',
      title: 'Projects',
      seoTitle: 'Projects: folders and conversations in one place',
      description: 'A project keeps the folders and conversations of one piece of work together. Create one, add folders, archive it and turn on the Coordinator.',
      body: `
${p('A project is one piece of work: the folders it uses on your PC and every conversation about it. Projects are listed in the left bar.')}
${h2('create', 'Create a project')}
${steps([
  ['Open “New project”', 'from the left bar.'],
  ['Name it', '(1 to 120 characters) and, if you like, choose an icon.'],
  ['Add context.', `${ui('Add a folder')} for code already on your PC, or ${ui('Clone a GitHub repository')}. With no folder, the project gets a new folder of its own.`],
  ['Write a goal (optional).', 'With a goal the Coordinator starts on it as soon as the project opens.'],
  [`Press ${ui('Create project')}.`, ''],
])}
${h2('folders', 'Several folders in one project')}
${p(`A project can hold up to 32 folders, for example a website and its server. One folder is ${ui('Main')}. All of the project’s conversations and agents can work in all of them.`)}
${h2('starters', 'Ways to begin')}
${p('A new project suggests a few starting points:')}
${table([
  [ui('Pick up recent work'), 'Looks at recent work and tells you where you left off and what comes next.'],
  [ui('Check the project'), 'Reads the project and tells you its state, what is broken and what to do first.'],
  [ui('Make a plan'), 'Makes a plan, split into steps for agents.'],
  [ui('Use my tools'), 'Lists the tools, connections and skills available and suggests how to use them.'],
])}
${h2('coordinator', 'With or without the Coordinator')}
${p('Without the Coordinator, a project is a tidy place for your conversations. With it, you give a goal and it splits the work between agents. See <a href="/docs/projects/coordinator/">The Coordinator</a>.')}
${h2('archive', 'Archive or remove')}
${list([
  `${ui('Archive project')} hides it from the left bar and archives its conversations. Find it again in Projects › Archived and bring it back any time. Nothing is deleted.`,
  'Removing a project takes it and its conversations out of Codevalanche. The files in the folder stay on your computer.',
  'If the project has a Coordinator, archiving or removing it stops its agents.',
])}`,
    },
    {
      slug: 'projects/coordinator',
      nav: 'The Coordinator',
      title: 'The Coordinator',
      seoTitle: 'The Coordinator: one goal, many AI agents',
      description: 'How the Coordinator turns one goal into a plan, starts AI coding agents in separate conversations, checks their work and asks you only when it needs you.',
      lede: 'Give a project one goal. The Coordinator splits it into tasks, starts an AI agent for each one in its own conversation, checks what comes back and tells you only when it needs you.',
      body: coordinatorBody,
    },
    {
      slug: 'projects/settings',
      nav: 'Project settings',
      title: 'Project settings',
      seoTitle: 'Project settings: Coordinator, folders, memory and usage',
      description: 'Every project setting explained: the Coordinator and its models, instructions, folders, memory files, usage and the Claude folder rules.',
      body: `
${p('Open a project’s menu and choose Settings. The window has five tabs: General, Coordinator, Folders, Memory and Usage.')}
${h2('general', 'General')}
${list([
  'Name and icon of the project.',
  `${ui('Claude can read the rules in the project folder')}: lets Claude Code read the <code>CLAUDE.md</code> file and the commands saved in the folder. Turn it on only for folders you trust.`,
  `${ui('Archive project')} and remove.`,
])}
${h2('models', 'Coordinator')}
${table([
  [ui('Project coordinator'), 'Turns the Coordinator on or off. Off stops its agents; nothing is deleted.'],
  [ui('Coordinator model'), 'The model that splits the work and starts the conversations.'],
  [ui('Model for agents'), `Used by the agents it starts from now on. ${ui('Same as the coordinator')} is the default.`],
  [ui('Continue on its own after the limit resets'), 'For the Coordinator’s agents. Off: an agent that reaches its plan’s limit stops and tells you.'],
])}
<h3 id="instructions">Instructions for the coordinator</h3>
${p('Write what you want it to achieve and how to work: the coding style, what not to touch, how to test. It reads them with every message. Instructions guide the work; they do not grant permissions.')}
${h2('folders', 'Folders')}
${p(`The project’s folders, up to 32. All of the project’s conversations and agents can work in them. ${ui('Make primary')} chooses the main one.`)}
<h2 id="memory">Memory</h2>
${p('Memory files are notes the project keeps for its agents: decisions, conventions, things learned. Add, edit or delete them here. The Coordinator reads them when it plans.')}
${h2('usage', 'Usage')}
${p('Reported usage of this project’s runs, per model. Code changes count only the lines the Coordinator’s agents reported. Runs that did not report usage are counted separately, so totals may be a little lower than real use.')}`,
    },
  ],
};
