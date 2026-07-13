# Guía de Despliegue en Railway: Bronze Gantt SaaS

Esta guía detalla los pasos para desplegar la plataforma "Bronze Gantt SaaS" en la nube usando **Railway** y configurar la base de datos PostgreSQL para producción y venta de licencias.

---

## 1. Requisitos Previos
*   Una cuenta en [Railway.app](https://railway.app/).
*   El cliente de Git instalado localmente o repositorio conectado a GitHub.

---

## 2. Configuración en Railway

### Paso A: Crear el Proyecto
1.  En el panel de Railway, selecciona **New Project**.
2.  Elige **Deploy from GitHub repository** (selecciona tu repositorio del proyecto) o realiza un despliegue desde CLI con `railway up`.

### Paso B: Agregar Base de Datos PostgreSQL
1.  En tu panel de proyecto en Railway, haz clic en **+ New** y selecciona **Database** -> **Add PostgreSQL**.
2.  Railway creará una base de datos Postgres dedicada en la nube e inyectará automáticamente la variable de entorno **`DATABASE_URL`** a tu servicio de Node.js.

### Paso C: Configurar Variables de Entorno
Ve a la pestaña **Variables** de tu servicio Node en Railway y configura las siguientes variables:

| Variable | Descripción | Valor Recomendado / Ejemplo |
| :--- | :--- | :--- |
| `DATABASE_URL` | URL de conexión de Postgres | *Inyectada automáticamente por Railway* |
| `JWT_SECRET` | Clave secreta para firmar tokens JWT | Un hash seguro aleatorio (ej: `c48fb9e...`) |
| `ADMIN_SECRET` | Clave de administración para generar licencias | Una contraseña fuerte (ej: `mi-secreto-admin-123`) |
| `PORT` | Puerto de enlace web | `3000` o `3001` (*Railway suele gestionarlo automáticamente*) |

---

## 3. Inicialización Automática de Datos
Al iniciar el servidor en Railway, `server.js` detecta `DATABASE_URL` e inicializa automáticamente las siguientes tablas en tu base de datos Postgres:
*   `users`: Usuarios registrados y su estado de licencia.
*   `license_keys`: Registro de llaves de licencia comerciales y su uso.
*   `projects`: Proyectos de Gantt de los usuarios serializados en JSON.

---

## 4. Gestión y Generación de Licencias para la Venta

La plataforma cuenta con un endpoint administrativo integrado para generar claves de licencia únicas listas para vender a tus usuarios.

### Generar Llaves de Licencia Comerciales
Para generar un lote de nuevas licencias, puedes enviar una solicitud HTTP POST al endpoint `/api/license/generate` usando herramientas como Postman, Insomnia o directamente mediante `curl` en la terminal:

```bash
curl -X POST https://tu-app-en-railway.up.railway.app/api/license/generate \
  -H "Content-Type: application/json" \
  -d '{
    "adminSecret": "tu-secreto-admin-configurado-en-variables",
    "count": 10
  }'
```

#### Respuesta del Servidor:
El servidor te devolverá un listado con las claves únicas generadas que puedes entregar a tus clientes para su activación en la pantalla de registro:
```json
{
  "message": "10 claves de licencia generadas con éxito.",
  "keys": [
    "GANTT-A7E2-BC4D-10F3",
    "GANTT-5D91-E8FF-020A",
    "GANTT-889E-CC4F-A1D5",
    ...
  ]
}
```

---

## 5. Script de Inicio
El archivo [package.json](package.json) está configurado con `"start": "node server.js"`. Railway ejecutará este comando automáticamente al finalizar la compilación (build) del contenedor.

¡Felicidades! Tu aplicación está lista para producción, cobro de licencias y almacenamiento en la nube a gran escala.
