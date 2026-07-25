const fs = require('fs');

const filePath = './src/features/profile/ProfilePage.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace('import { getSupabaseClient } from "~/lib/supabase/client";', 'import { getClient } from "~/lib/supabase/client";');
content = content.replace(/await getSupabaseClient\(\)/g, 'await getClient()');

fs.writeFileSync(filePath, content, 'utf8');
