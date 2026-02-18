INSERT INTO "CompanyPrice"
("id","companyId","refKey","price","unit","validFrom","validTo","note")
VALUES
  (
    'seed-labor-tiefbau',
    '3b26c90c-44c6-46c2-9522-090748c64aa9',
    'LABOR:TIEFBAU',
    45,
    'pauschal',
    now(),
    NULL,
    'seed'
  ),
  (
    'seed-machine-transporter',
    '3b26c90c-44c6-46c2-9522-090748c64aa9',
    'MACHINE:TRANSPORTER',
    80,
    'pauschal',
    now(),
    NULL,
    'seed'
  )
ON CONFLICT ("companyId","refKey","validFrom") DO NOTHING;
