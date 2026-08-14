import fs from "node:fs/promises";
import mysql from "mysql2/promise";

const importPath = "/home/ubuntu/occurrences-source/import/historical_occurrences_import.json";
const payload = JSON.parse(await fs.readFile(importPath, "utf8"));
const connection = await mysql.createConnection(process.env.DATABASE_URL);

const occurrenceColumns = { type: "occurrence_type", origin: "occurrence_origin", nonconformingProductClass: "occurrence_pnc_class", status: "occurrence_status", effectiveness: "occurrence_effectiveness", impactsObjectives: "occurrence_impacts_objectives" };
const complaintColumns = { category: "supplier_complaint_category", status: "occurrence_status" };
const databaseRecord = (record, map) => Object.fromEntries(Object.entries(record).map(([key, value]) => [map[key] ?? key, key === "recurrent" ? (value === true || value === "true" ? 1 : 0) : value]));

async function insertIfMissing(table, record, match) {
  const [existing] = await connection.execute(`SELECT id FROM ${table} WHERE ${match.column} = ? AND createdBy = ? LIMIT 1`, [match.value, "historic-import"]);
  if (existing.length) return false;
  const columns = Object.keys(record);
  const values = columns.map((column) => record[column]);
  const placeholders = columns.map(() => "?").join(",");
  await connection.execute(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`, values);
  return true;
}

let occurrencesInserted = 0;
let complaintsInserted = 0;
try {
  await connection.beginTransaction();
  for (const record of payload.occurrences) {
    if (await insertIfMissing("occurrences", databaseRecord(record, occurrenceColumns), { column: "number", value: record.number })) occurrencesInserted += 1;
  }
  for (const record of payload.supplierComplaints) {
    if (await insertIfMissing("supplier_complaints", databaseRecord(record, complaintColumns), { column: "number", value: record.number })) complaintsInserted += 1;
  }
  await connection.commit();
  console.log(JSON.stringify({ occurrencesSource: payload.occurrences.length, occurrencesInserted, complaintsSource: payload.supplierComplaints.length, complaintsInserted }));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.destroy();
}
