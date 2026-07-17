// Crea (o actualiza la contraseña de) el usuario administrador en Supabase.
//
// Uso:
//   node scripts/create-admin.js                     -> usa ADMIN_USER y ADMIN_PASSWORD del .env
//   node scripts/create-admin.js miusuario mipass123  -> usa los valores pasados por consola
//
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en tu archivo .env');
  process.exit(1);
}

const username = process.argv[2] || process.env.ADMIN_USER || 'admin';
const password = process.argv[3] || process.env.ADMIN_PASSWORD;

if (!password) {
  console.error('❌ No se especificó contraseña. Pasala como segundo argumento o definí ADMIN_PASSWORD en .env');
  process.exit(1);
}
if (password.length < 6) {
  console.error('❌ La contraseña debe tener al menos 6 caracteres');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const passwordHash = bcrypt.hashSync(password, 10);

  const { data: existente, error: findError } = await supabase
    .from('admin_users')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (findError) {
    console.error('❌ Error consultando Supabase:', findError.message);
    process.exit(1);
  }

  if (existente) {
    const { error } = await supabase.from('admin_users').update({ password_hash: passwordHash }).eq('id', existente.id);
    if (error) {
      console.error('❌ Error actualizando el usuario:', error.message);
      process.exit(1);
    }
    console.log(`✅ Contraseña actualizada para el usuario "${username}"`);
  } else {
    const { error } = await supabase.from('admin_users').insert({ username, password_hash: passwordHash });
    if (error) {
      console.error('❌ Error creando el usuario:', error.message);
      process.exit(1);
    }
    console.log(`✅ Usuario administrador "${username}" creado correctamente`);
  }
})();
