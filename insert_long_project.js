const fs = require('fs');
const path = 'database_local.json';

if (fs.existsSync(path)) {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    
    const newProjId = 'proj_large_infra_3years';
    
    // Eliminar si ya existe para reinsertar limpio
    data.projects = data.projects.filter(p => p.id !== newProjId);
    
    const longProject = {
        "id": newProjId,
        "user_id": 1,
        "name": "Proyecto_Gran_Infraestructura_3_Anos.xlsx",
        "start": "2026-07-01",
        "status": "active",
        "excludeWeekends": true,
        "tasks": [
            { "id": 1, "name": "FASE 1: PLANIFICACIÓN Y FACTIBILIDAD", "start": "2026-07-01", "duration": 190, "dependencies": "", "progress": 95, "owner": "Comité", "risk": "Low", "indent": 0 },
            { "id": 2, "name": "Estudios Ambientales e Ingeniería Básica", "start": "2026-07-01", "duration": 80, "dependencies": "", "progress": 85, "owner": "Consultor", "risk": "Medium", "indent": 1 },
            { "id": 3, "name": "Adquisición de Licencias y Permisos Estatales", "start": "2026-07-01", "duration": 110, "dependencies": "2FS", "progress": 50, "owner": "Legal", "risk": "High", "indent": 1 },
            { "id": 4, "name": "Hito: Viabilidad Técnica Aprobada", "start": "2026-07-01", "duration": 0, "dependencies": "3FS", "progress": 0, "owner": "PM", "risk": "Low", "indent": 0 },
            { "id": 5, "name": "FASE 2: CONSTRUCCIÓN Y OBRAS CIVILES", "start": "2026-07-01", "duration": 460, "dependencies": "", "progress": 10, "owner": "Ingeniero Civil", "risk": "Medium", "indent": 0 },
            { "id": 6, "name": "Movimiento de Tierras y Excavación", "start": "2026-07-01", "duration": 150, "dependencies": "4FS", "progress": 40, "owner": "Contratista A", "risk": "Medium", "indent": 1 },
            { "id": 7, "name": "Cimentación y Fundaciones Estructurales", "start": "2026-07-01", "duration": 120, "dependencies": "6FS", "progress": 0, "owner": "Contratista A", "risk": "High", "indent": 1 },
            { "id": 8, "name": "Montaje de Estructura Principal", "start": "2026-07-01", "duration": 190, "dependencies": "7FS", "progress": 0, "owner": "Contratista B", "risk": "Medium", "indent": 1 },
            { "id": 9, "name": "FASE 3: INSTALACIONES, ACABADOS Y PRUEBAS", "start": "2026-07-01", "duration": 320, "dependencies": "", "progress": 0, "owner": "Supervisor", "risk": "Low", "indent": 0 },
            { "id": 10, "name": "Instalación de Redes Eléctricas y Sanitarias", "start": "2026-07-01", "duration": 130, "dependencies": "8FS", "progress": 0, "owner": "Subcontrato E", "risk": "Medium", "indent": 1 },
            { "id": 11, "name": "Acabados de Fachada e Interiores", "start": "2026-07-01", "duration": 140, "dependencies": "10FS", "progress": 0, "owner": "Subcontrato F", "risk": "Low", "indent": 1 },
            { "id": 12, "name": "Pruebas de Sistemas y Comisionamiento", "start": "2026-07-01", "duration": 50, "dependencies": "11FS", "progress": 0, "owner": "QA Team", "risk": "High", "indent": 1 },
            { "id": 13, "name": "Hito: Entrega y Cierre del Proyecto", "start": "2026-07-01", "duration": 0, "dependencies": "12FS", "progress": 0, "owner": "PM", "risk": "Low", "indent": 0 }
        ]
    };
    
    data.projects.push(longProject);
    fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
    console.log("Nuevo proyecto corregido 'Proyecto_Gran_Infraestructura_3_Anos.xlsx' insertado con éxito.");
} else {
    console.error("No se encontró database_local.json.");
}
