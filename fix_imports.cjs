const fs = require('fs');

const filePath = './src/features/profile/ProfilePage.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace('import { useAuth } from "~/core/auth/AuthContext";', 'import { useAuth } from "~/shared/hooks/useAuth";');
content = content.replace('import { useModal } from "~/core/modal/ModalContext";', 'import { useAuthModal } from "~/shared/hooks/useAuthModal";');
content = content.replace('import { useToast } from "~/core/toast/ToastContext";', 'import { useToast } from "~/shared/hooks/useToast";');
content = content.replace('import { supabase } from "~/core/supabase/supabaseClient";', 'import { getClient } from "~/lib/supabase/client";');
content = content.replace(/await supabase/g, 'await getClient()');

content = content.replace('const { openAuthModal } = useModal();', 'const { openAuthModal } = useAuthModal();');
content = content.replace('const { user, initial, isGuest, isSignedIn } = useAuth();', 'const { user, isSignedIn } = useAuth();\n  const isGuest = () => !isSignedIn();\n  const initial = () => user()?.displayName?.charAt(0) ?? "U";');

fs.writeFileSync(filePath, content, 'utf8');
