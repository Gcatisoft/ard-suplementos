// crear-admin.js
// Crea un nuevo usuario para el panel de administración (tabla admin_users).
//
// Uso:
//   node crear-admin.js <usuario> <contraseña>
//
// Ejemplo:
//   node crear-admin.js maria "unaClaveSegura123"
//
// Requiere que existan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en tu .env
// (las mismas que ya usa server.js). Corré esto UNA vez por cada persona
// nueva que quieras que tenga su propio login al panel.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en tu .env');
  process.exit(1);
}

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Uso: node crear-admin.js <usuario> <contraseña>');
  process.exit(1);
}

if (password.length < 6) {
  console.error('❌ La contraseña debe tener al menos 6 caracteres.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

(async () => {
  const passwordHash = bcrypt.hashSync(password, 10);

  const { data, error } = await supabase
    .from('admin_users')
    .insert({ username: username.trim(), password_hash: passwordHash })
    .select('id, username, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      console.error(`❌ Ya existe un usuario admin con el nombre "${username}".`);
    } else {
      console.error('❌ Error al crear el usuario:', error.message);
    }
    process.exit(1);
  }

  console.log(`✅ Usuario admin creado: "${data.username}" (id: ${data.id})`);
  console.log('   Ya puede iniciar sesión en /admin/login.html con esa contraseña.');
  process.exit(0);
})();
