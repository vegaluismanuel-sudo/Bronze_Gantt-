const fs = require('fs');

function parseDateString(str) {
    if (!str) return new Date();
    const parts = str.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Domingo, 6 = Sábado
}

function addDays(date, days, excludeWeekends) {
    const result = new Date(date.getTime());
    let added = 0;
    const direction = days >= 0 ? 1 : -1;
    const target = Math.abs(days);
    
    while (added < target) {
        result.setDate(result.getDate() + direction);
        if (!excludeWeekends || !isWeekend(result)) {
            added++;
        }
    }
    return result;
}

function getDaysDifference(start, end, excludeWeekends) {
    if (!start || !end) return 0;
    const s = new Date(start.getTime());
    const e = new Date(end.getTime());
    if (s > e) return 0;
    
    let days = 0;
    const temp = new Date(s.getTime());
    while (temp < e) {
        if (!excludeWeekends || !isWeekend(temp)) {
            days++;
        }
        temp.setDate(temp.getDate() + 1);
    }
    return days;
}

function isParentRow(tasks, index) {
    if (index >= tasks.length - 1) return false;
    return tasks[index + 1].indent > tasks[index].indent;
}

function resolveWBSHierarchy(tasks, excludeWeekends) {
    let changed = false;
    for (let i = tasks.length - 1; i >= 0; i--) {
        const task = tasks[i];
        const isParent = isParentRow(tasks, i);

        if (isParent) {
            let children = [];
            for (let j = i + 1; j < tasks.length; j++) {
                if (tasks[j].indent <= task.indent) break;
                children.push(tasks[j]);
            }

            if (children.length > 0) {
                const leafChildren = children.filter(c => !isParentRow(children, children.indexOf(c)));
                const activeChildren = leafChildren.length > 0 ? leafChildren : children;

                let minStart = null;
                let maxEnd = null;
                let sumProgress = 0;

                activeChildren.forEach(c => {
                    const cStart = parseDateString(c.start);
                    const cEnd = parseDateString(c.end);
                    if (!minStart || cStart < minStart) minStart = cStart;
                    if (!maxEnd || cEnd > maxEnd) maxEnd = cEnd;
                    sumProgress += c.progress || 0;
                });

                const avgProgress = Math.round(sumProgress / activeChildren.length);
                const newStartStr = formatDateString(minStart);
                const newEndStr = formatDateString(maxEnd);
                const newDuration = getDaysDifference(minStart, maxEnd, excludeWeekends);

                if (task.start !== newStartStr || task.end !== newEndStr || task.progress !== avgProgress || task.duration !== newDuration) {
                    task.start = newStartStr;
                    task.end = newEndStr;
                    task.duration = newDuration;
                    task.progress = avgProgress;
                    changed = true;
                }
            }
        }
    }
    return changed;
}

function parseDependency(str) {
    const match = str.trim().match(/^(\d+)(FS|SS|FF|SF)?([+-]\d+)?$/i);
    if (!match) return null;
    return {
        predecessorId: parseInt(match[1]),
        type: match[2] ? match[2].toUpperCase() : "FS",
        lag: match[3] ? parseInt(match[3]) : 0
    };
}

const dbData = JSON.parse(fs.readFileSync('database_local.json', 'utf8'));
const project = dbData.projects.find(p => p.id === 'proj_large_infra_3years');

console.log("Simulando planificación inicial...");
let tasks = JSON.parse(JSON.stringify(project.tasks));
const excludeW = project.excludeWeekends;

// Inicializar fechas de fin básicas para tareas que no las tengan o tengan duración
tasks.forEach(t => {
    t.start = t.start || project.start;
    t.end = t.end || formatDateString(addDays(parseDateString(t.start), t.duration, excludeW));
});

resolveWBSHierarchy(tasks, excludeW);

let maxIterations = 100;
let changesOccurred = true;
let iterations = 0;

while (changesOccurred && iterations < maxIterations) {
    changesOccurred = false;
    iterations++;

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (isParentRow(tasks, i)) continue;

        if (task.dependencies) {
            const depList = task.dependencies.split(',').map(d => parseDependency(d)).filter(Boolean);
            
            let earliestStart = null;
            let earliestEnd = null;

            depList.forEach(dep => {
                const pred = tasks.find(t => t.id === dep.predecessorId);
                if (!pred) return;

                const pStart = parseDateString(pred.start);
                const pEnd = parseDateString(pred.end);
                
                let calcStart = null;
                let calcEnd = null;

                if (dep.type === "FS") {
                    calcStart = addDays(pEnd, dep.lag, excludeW);
                } else if (dep.type === "SS") {
                    calcStart = addDays(pStart, dep.lag, excludeW);
                } else if (dep.type === "FF") {
                    calcEnd = addDays(pEnd, dep.lag, excludeW);
                } else if (dep.type === "SF") {
                    calcEnd = addDays(pStart, dep.lag, excludeW);
                }

                if (calcStart && (!earliestStart || calcStart > earliestStart)) earliestStart = calcStart;
                if (calcEnd && (!earliestEnd || calcEnd > earliestEnd)) earliestEnd = calcEnd;
            });

            if (earliestStart) {
                const currentStart = parseDateString(task.start);
                if (formatDateString(currentStart) !== formatDateString(earliestStart)) {
                    task.start = formatDateString(earliestStart);
                    task.end = formatDateString(addDays(earliestStart, task.duration, excludeW));
                    changesOccurred = true;
                }
            }
            if (earliestEnd) {
                const currentEnd = parseDateString(task.end);
                if (formatDateString(currentEnd) !== formatDateString(earliestEnd)) {
                    task.end = formatDateString(earliestEnd);
                    task.start = formatDateString(addDays(earliestEnd, -task.duration, excludeW));
                    changesOccurred = true;
                }
            }
        }
    }

    const hierarchyChanged = resolveWBSHierarchy(tasks, excludeW);
    if (hierarchyChanged) changesOccurred = true;
}

console.log(`Finalizado en ${iterations} iteraciones.`);
tasks.forEach(t => {
    console.log(`ID: ${t.id} | Name: ${t.name.substring(0, 30)} | Start: ${t.start} | End: ${t.end} | Duration: ${t.duration}`);
});
