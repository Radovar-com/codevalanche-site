import { mountAdminAccounts } from './adminAccounts.js'

// Configuration is supplied by the existing operator host. No public credentials
// or endpoint are inferred, and no admin route is enabled by this entry page.
const config = window.CODEVALANCHE_ADMIN_ACCOUNTS
mountAdminAccounts({ ...(config || {}), host: document.getElementById('admin-accounts') })
