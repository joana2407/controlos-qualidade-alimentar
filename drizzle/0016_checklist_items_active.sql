ALTER TABLE checklist_items
  ADD COLUMN active ENUM('true', 'false') NOT NULL DEFAULT 'true';
