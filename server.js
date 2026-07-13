const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001; // Puerto 3001 para no colisionar con RyR app (3000)
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-bronze-apps-gantt-saas';

app.use(express.json());

// Desactivar caché del navegador para desarrollo local
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Servir frontend de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Redirigir la raíz al login por defecto
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// ==========================================================================
// ADAPTADOR DE BASE DE DATOS (POSTGRESQL CON FALLBACK A SIMULACIÓN EN MEMORIA)
// ==========================================================================
let db;
const usePostgres = !!(process.env.DATABASE_URL || process.env.PGHOST);

if (usePostgres) {
  console.log('Conectando a base de datos PostgreSQL de Railway (Gantt SaaS)...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
  });
  
  db = {
    query: (text, params) => pool.query(text, params),
    init: async () => {
      // Crear tablas en Postgres
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          license_key VARCHAR(255),
          license_active BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS license_keys (
          key VARCHAR(255) PRIMARY KEY,
          active BOOLEAN DEFAULT TRUE,
          used_by_user_id INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id VARCHAR(255) PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          start VARCHAR(255) NOT NULL,
          status VARCHAR(255) NOT NULL,
          exclude_weekends BOOLEAN DEFAULT TRUE,
          tasks_json TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Tablas inicializadas en PostgreSQL (Gantt SaaS).');
    }
  };
} else {
  console.log('=== DESARROLLO LOCAL: Usando base de datos simulada en memoria (Gantt SaaS) ===');
  console.log('Para usar Postgres, configure DATABASE_URL en su archivo .env');
  
  const DB_FILE = path.join(__dirname, 'database_local.json');
  
  let MEMORY_DB = {
    users: [],
    license_keys: [
      { key: 'DEMO-KEY-1111', active: true, used_by_user_id: null },
      { key: 'DEMO-KEY-2222', active: true, used_by_user_id: null },
      { key: 'DEMO-KEY-3333', active: true, used_by_user_id: null }
    ],
    projects: []
  };

  const saveLocalDb = () => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(MEMORY_DB, null, 2), 'utf8');
    } catch (err) {
      console.error('Error al guardar la base de datos local:', err);
    }
  };

  const loadLocalDb = () => {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed.users) MEMORY_DB.users = parsed.users;
        if (parsed.projects) MEMORY_DB.projects = parsed.projects;
        if (parsed.license_keys && parsed.license_keys.length > 0) {
          MEMORY_DB.license_keys = parsed.license_keys;
        }
        console.log(`[Persistencia] Base de datos local Gantt cargada con éxito desde ${DB_FILE}`);
      } else {
        saveLocalDb();
        console.log(`[Persistencia] Creado archivo de base de datos local Gantt en ${DB_FILE}`);
      }
    } catch (err) {
      console.error('Error al cargar la base de datos local:', err);
    }
  };

  db = {
    init: async () => {
      loadLocalDb();
      console.log('Base de datos local inicializada.');
    },
    query: async (text, params = []) => {
      const sql = text.trim().replace(/\s+/g, ' ');
      
      // 1. Registro de usuario
      if (sql.startsWith('INSERT INTO users')) {
        const email = params[0];
        const pass = params[1];
        if (MEMORY_DB.users.find(u => u.email === email)) {
          throw new Error('duplicate key value violates unique constraint');
        }
        const newUser = { id: MEMORY_DB.users.length + 1, email, password_hash: pass, license_key: null, license_active: false };
        MEMORY_DB.users.push(newUser);
        saveLocalDb();
        return { rows: [newUser] };
      }
      
      // 2. Buscar usuario por email
      if (sql.startsWith('SELECT * FROM users WHERE email =')) {
        const email = params[0];
        const user = MEMORY_DB.users.find(u => u.email === email);
        return { rows: user ? [user] : [] };
      }
      
      // 3. Buscar usuario por id
      if (sql.includes('FROM users WHERE id =')) {
        const id = parseInt(params[0]);
        const user = MEMORY_DB.users.find(u => u.id === id);
        return { rows: user ? [user] : [] };
      }
      
      // 4. Buscar llave de licencia
      if (sql.startsWith('SELECT * FROM license_keys WHERE key =')) {
        const key = params[0];
        const lic = MEMORY_DB.license_keys.find(l => l.key === key);
        return { rows: lic ? [lic] : [] };
      }
      
      // 5. Activar licencia en usuario
      if (sql.startsWith('UPDATE users SET license_key =')) {
        const key = params[0];
        const userId = parseInt(params[1]);
        const user = MEMORY_DB.users.find(u => u.id === userId);
        if (user) {
          user.license_key = key;
          user.license_active = true;
          saveLocalDb();
        }
        return { rowCount: user ? 1 : 0 };
      }
      
      // 6. Marcar llave de licencia como usada
      if (sql.startsWith('UPDATE license_keys SET active = false')) {
        const userId = parseInt(params[0]);
        const key = params[1];
        const lic = MEMORY_DB.license_keys.find(l => l.key === key);
        if (lic) {
          lic.active = false;
          lic.used_by_user_id = userId;
          saveLocalDb();
        }
        return { rowCount: lic ? 1 : 0 };
      }

      // 7. Insertar llave de licencia (Administración)
      if (sql.startsWith('INSERT INTO license_keys')) {
        const key = params[0];
        if (MEMORY_DB.license_keys.find(l => l.key === key)) {
          throw new Error('Key already exists');
        }
        const newLic = { key, active: true, used_by_user_id: null };
        MEMORY_DB.license_keys.push(newLic);
        saveLocalDb();
        return { rows: [newLic] };
      }
      
      // 8. CRUD Proyectos: Guardar o actualizar proyecto
      if (sql.startsWith('INSERT INTO projects')) {
        const [id, userId, name, start, status, excludeWeekends, tasksJson] = params;
        
        MEMORY_DB.projects = MEMORY_DB.projects.filter(p => p.id !== id);
        
        const newProj = { 
          id, 
          user_id: parseInt(userId), 
          name, 
          start, 
          status, 
          excludeWeekends: !!excludeWeekends, 
          tasks: JSON.parse(tasksJson) 
        };
        MEMORY_DB.projects.push(newProj);
        saveLocalDb();
        return { rows: [newProj] };
      }
      
      // 9. CRUD Proyectos: Listar proyectos de un usuario
      if (sql.startsWith('SELECT id, name, start, status')) {
        const userId = parseInt(params[0]);
        // Para desarrollo local, asignar todos los proyectos al usuario actual para que siempre sean visibles
        const list = MEMORY_DB.projects
          .map(p => ({ ...p, user_id: userId }))
          .map(p => ({ id: p.id, name: p.name, start: p.start, status: p.status, exclude_weekends: p.excludeWeekends, tasks_count: p.tasks.length }));
        return { rows: list };
      }
      
      // 10. CRUD Proyectos: Cargar proyecto por ID
      if (sql.startsWith('SELECT * FROM projects WHERE id =')) {
        const id = params[0];
        const proj = MEMORY_DB.projects.find(p => p.id === id);
        if (proj) {
          // Adaptar para que devuelva el formato de la base de datos SQL real, forzando el user_id del solicitante
          return { rows: [{
            id: proj.id,
            user_id: proj.user_id,
            name: proj.name,
            start: proj.start,
            status: proj.status,
            exclude_weekends: proj.excludeWeekends,
            tasks_json: JSON.stringify(proj.tasks)
          }] };
        }
        return { rows: [] };
      }
      
      // 11. CRUD Proyectos: Eliminar proyecto por ID
      if (sql.startsWith('DELETE FROM projects WHERE id =')) {
        const id = params[0];
        const countBefore = MEMORY_DB.projects.length;
        MEMORY_DB.projects = MEMORY_DB.projects.filter(p => p.id !== id);
        saveLocalDb();
        return { rowCount: countBefore - MEMORY_DB.projects.length };
      }

      return { rows: [] };
    }
  };
}

// Inicializar DB
db.init().catch(err => console.error('Error al inicializar tablas DB (Gantt):', err));

// ==========================================================================
// MIDDLEWARE DE AUTENTICACIÓN JWT
// ==========================================================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acceso no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token de acceso no válido o expirado.' });
    }
    req.user = user;
    next();
  });
};

const checkActiveLicense = async (req, res, next) => {
  try {
    const userCheck = await db.query(`SELECT license_active FROM users WHERE id = $1`, [req.user.id]);
    if (userCheck.rows.length === 0 || !userCheck.rows[0].license_active) {
      return res.status(403).json({ error: 'Acceso denegado. Su licencia no está activa.' });
    }
    next();
  } catch (err) {
    console.error('Error al verificar la licencia:', err);
    res.status(500).json({ error: 'Error interno al verificar el estado de la licencia.' });
  }
};

// ==========================================================================
// RUTAS DE LA API - AUTENTICACIÓN
// ==========================================================================

// Registro de Usuario
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Debe ingresar email y contraseña.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
      [email.toLowerCase().trim(), passwordHash]
    );

    const user = result.rows[0];
    res.status(201).json({ message: 'Usuario registrado correctamente.', userId: user.id });
  } catch (err) {
    if (err.message.includes('unique constraint') || err.message.includes('duplicate key')) {
      return res.status(400).json({ error: 'El correo ingresado ya se encuentra registrado.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor al registrar usuario.' });
  }
});

// Inicio de Sesión
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Debe ingresar email y contraseña.' });
  }

  try {
    const result = await db.query(
      `SELECT * FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    // Generar JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      email: user.email,
      licenseActive: user.license_active,
      licenseKey: user.license_key
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor al iniciar sesión.' });
  }
});

// Perfil actual
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, license_key, license_active, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener información del perfil.' });
  }
});

// ==========================================================================
// RUTAS DE LA API - CONTROL DE LICENCIAS
// ==========================================================================

// Activar Clave de Licencia
app.post('/api/license/activate', authenticateToken, async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey) {
    return res.status(400).json({ error: 'Debe ingresar una clave de licencia.' });
  }

  const cleanKey = licenseKey.trim();

  try {
    const resultKey = await db.query(
      `SELECT * FROM license_keys WHERE key = $1`,
      [cleanKey]
    );

    if (resultKey.rows.length === 0) {
      return res.status(400).json({ error: 'La clave de licencia ingresada no es válida.' });
    }

    const license = resultKey.rows[0];

    if (!license.active) {
      return res.status(400).json({ error: 'Esta clave de licencia ya ha sido utilizada.' });
    }

    await db.query(
      `UPDATE users SET license_key = $1, license_active = true WHERE id = $2`,
      [cleanKey, req.user.id]
    );

    await db.query(
      `UPDATE license_keys SET active = false, used_by_user_id = $1 WHERE key = $2`,
      [req.user.id, cleanKey]
    );

    res.json({ message: '¡Licencia activada con éxito! La plataforma ha sido desbloqueada.', licenseActive: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al activar la licencia.' });
  }
});

// Endpoint administrativo para generar claves
app.post('/api/license/generate', async (req, res) => {
  const { adminSecret, count } = req.body;
  const SECRET_ADMIN = process.env.ADMIN_SECRET || 'bronze-admin-secret-99';

  if (adminSecret !== SECRET_ADMIN) {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  const numKeys = parseInt(count) || 5;
  const generated = [];

  try {
    for (let i = 0; i < numKeys; i++) {
      const uniqueKey = 'GANTT-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
                         Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
                         Math.random().toString(36).substring(2, 6).toUpperCase();
      
      await db.query(
        `INSERT INTO license_keys (key, active) VALUES ($1, true)`,
        [uniqueKey]
      );
      generated.push(uniqueKey);
    }
    res.status(201).json({ message: `Se generaron ${numKeys} claves de licencia.`, keys: generated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar claves de licencia.' });
  }
});

// ==========================================================================
// RUTAS DE LA API - CRUD PROYECTOS GANTT
// ==========================================================================

// Guardar/Actualizar un proyecto
app.post('/api/projects', authenticateToken, checkActiveLicense, async (req, res) => {
  const { id, name, start, status, excludeWeekends, tasks } = req.body;

  if (!id || !name || !start || !status || tasks === undefined) {
    return res.status(400).json({ error: 'Datos del proyecto incompletos.' });
  }

  try {
    await db.query(
      `INSERT INTO projects (id, user_id, name, start, status, exclude_weekends, tasks_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        req.user.id,
        name,
        start,
        status,
        !!excludeWeekends,
        JSON.stringify(tasks)
      ]
    );

    res.status(201).json({ message: 'Proyecto guardado correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar el proyecto en el servidor.' });
  }
});

// Listar proyectos del usuario actual
app.get('/api/projects', authenticateToken, checkActiveLicense, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, start, status FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar proyectos.' });
  }
});

// Cargar un proyecto completo por ID
app.get('/api/projects/:id', authenticateToken, checkActiveLicense, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT * FROM projects WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }

    const row = result.rows[0];
    
    res.json({
      id: row.id,
      name: row.name,
      start: row.start,
      status: row.status,
      excludeWeekends: !!row.exclude_weekends,
      tasks: JSON.parse(row.tasks_json)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al recuperar el proyecto.' });
  }
});

// Eliminar un proyecto por ID
app.delete('/api/projects/:id', authenticateToken, checkActiveLicense, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `DELETE FROM projects WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado o no autorizado.' });
    }

    res.json({ message: 'Proyecto eliminado correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el proyecto.' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor de Bronze Gantt corriendo en http://localhost:${PORT}`);
});
