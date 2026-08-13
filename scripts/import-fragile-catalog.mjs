import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

const catalogPath = '/home/ubuntu/catalogo_quebraveis.json';
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const factoryCodeByName = {
  'Fábrica 1 (Fatiado)': 'F1_FATIADO',
  'Fábrica 2 (granel)': 'F2_GRANEL',
  'Fabrica 3 (Sem Gluten)': 'F3_SEM_GLUTEN',
};

function classifyItem(name) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/(vidro|janela|espelho|termometro|higrometro)/.test(normalized)) return 'Vidro';
  if (/(plast|acril|lamela|raspa|caixa|balde|pincel|espatula|goble|colher|pas |oculos|borrifador)/.test(normalized)) return 'Plástico rígido';
  return 'Outro';
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [[existing]] = await connection.query("SELECT COUNT(*) AS count FROM fragile_items WHERE sourceSheet IS NOT NULL");
  if (Number(existing.count) > 0) throw new Error('Já existem pontos importados com origem identificada. A importação foi interrompida para evitar duplicados.');

  const [factoryRows] = await connection.query('SELECT id, code FROM factories');
  const factoryIdByCode = new Map(factoryRows.map((factory) => [factory.code, factory.id]));
  const [[admin]] = await connection.query("SELECT openId FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
  if (!admin?.openId) throw new Error('Não foi encontrado um administrador para registar a origem da importação.');

  const counters = new Map();
  const rows = catalog.map((point) => {
    const code = factoryCodeByName[point.factory];
    const factoryId = factoryIdByCode.get(code);
    if (!factoryId) throw new Error(`Fábrica não encontrada: ${point.factory}`);
    const counterKey = `${factoryId}:${point.area}`;
    const sortOrder = (counters.get(counterKey) ?? 0) + 1;
    counters.set(counterKey, sortOrder);
    return [point.label, point.area, factoryId, point.periodicity, point.area, sortOrder, classifyItem(point.label), 'active', admin.openId];
  });

  for (let start = 0; start < rows.length; start += 100) {
    const batch = rows.slice(start, start + 100);
    await connection.query(
      'INSERT INTO fragile_items (name, location, factoryId, fragile_periodicity, sourceSheet, sortOrder, fragile_type, fragile_status, createdBy) VALUES ?',
      [batch],
    );
  }

  const [summary] = await connection.query(
    'SELECT f.name AS factory, fi.location AS area, fi.fragile_periodicity AS periodicity, COUNT(*) AS total FROM fragile_items fi JOIN factories f ON f.id = fi.factoryId WHERE fi.sourceSheet IS NOT NULL GROUP BY f.name, fi.location, fi.fragile_periodicity ORDER BY f.name, fi.location, fi.fragile_periodicity',
  );
  console.log(JSON.stringify({ imported: rows.length, summary }, null, 2));
} finally {
  await connection.end();
}
