CREATE TABLE IF NOT EXISTS matriculas_autorizadas (
  matricula TEXT PRIMARY KEY NOT NULL CHECK (length(matricula) > 0),
  utilizada INTEGER NOT NULL DEFAULT 0 CHECK (utilizada IN (0, 1))
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_completo TEXT NOT NULL CHECK (length(trim(nome_completo)) > 0),
  matricula TEXT NOT NULL UNIQUE REFERENCES matriculas_autorizadas(matricula),
  email_institucional TEXT NOT NULL UNIQUE CHECK (length(trim(email_institucional)) > 0),
  senha_hash TEXT NOT NULL,
  telefone TEXT NOT NULL CHECK (length(trim(telefone)) > 0),
  foto_perfil_path TEXT,
  conta_ativa INTEGER NOT NULL DEFAULT 1 CHECK (conta_ativa IN (0, 1)),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS veiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  marca TEXT NOT NULL CHECK (length(trim(marca)) > 0),
  modelo TEXT NOT NULL CHECK (length(trim(modelo)) > 0),
  cor TEXT NOT NULL CHECK (length(trim(cor)) > 0),
  placa TEXT NOT NULL CHECK (length(trim(placa)) > 0),
  ano INTEGER NOT NULL CHECK (ano > 0),
  capacidade_passageiros INTEGER NOT NULL CHECK (capacidade_passageiros > 0),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS recorrencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorista_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE RESTRICT,
  dias_semana TEXT NOT NULL CHECK (json_valid(dias_semana)),
  horario TEXT NOT NULL CHECK (length(trim(horario)) > 0),
  origem TEXT NOT NULL CHECK (length(trim(origem)) > 0),
  destino TEXT NOT NULL CHECK (length(trim(destino)) > 0),
  paradas TEXT NOT NULL CHECK (json_valid(paradas)),
  vagas INTEGER NOT NULL CHECK (vagas > 0),
  valor REAL NOT NULL CHECK (valor >= 0),
  ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
  janela_dias INTEGER NOT NULL DEFAULT 15 CHECK (janela_dias = 15),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ofertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorista_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE RESTRICT,
  recorrencia_id INTEGER REFERENCES recorrencias(id) ON DELETE SET NULL,
  origem TEXT NOT NULL CHECK (length(trim(origem)) > 0),
  destino TEXT NOT NULL CHECK (length(trim(destino)) > 0),
  paradas TEXT NOT NULL CHECK (json_valid(paradas)),
  data_hora_saida TEXT NOT NULL CHECK (length(trim(data_hora_saida)) > 0),
  vagas_total INTEGER NOT NULL CHECK (vagas_total > 0),
  valor REAL NOT NULL CHECK (valor >= 0),
  estado TEXT NOT NULL DEFAULT 'ABERTA' CHECK (estado IN ('ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
  natureza_cancelamento TEXT,
  iniciada_em TEXT,
  concluida_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (recorrencia_id, data_hora_saida)
);

CREATE TABLE IF NOT EXISTS reservas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oferta_id INTEGER NOT NULL REFERENCES ofertas(id) ON DELETE RESTRICT,
  passageiro_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'CONFIRMADA' CHECK (status IN ('CONFIRMADA', 'CANCELADA', 'NO_SHOW')),
  natureza_cancelamento TEXT,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS penalidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  pontos INTEGER NOT NULL CHECK (pontos IN (1, 2)),
  motivo TEXT NOT NULL CHECK (length(trim(motivo)) > 0),
  tipo_evento TEXT NOT NULL CHECK (length(trim(tipo_evento)) > 0),
  referencia TEXT NOT NULL CHECK (
    referencia LIKE 'viagem:%' OR referencia LIKE 'oferta:%' OR referencia LIKE 'reserva:%'
  ),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oferta_id INTEGER NOT NULL REFERENCES ofertas(id) ON DELETE RESTRICT,
  avaliador_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  avaliado_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (oferta_id, avaliador_id)
);

CREATE TABLE IF NOT EXISTS historico_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_evento TEXT NOT NULL CHECK (length(trim(tipo_evento)) > 0),
  entidade_tipo TEXT NOT NULL CHECK (
    entidade_tipo IN ('usuario', 'veiculo', 'recorrencia', 'oferta', 'reserva', 'penalidade', 'avaliacao')
  ),
  entidade_id INTEGER NOT NULL,
  ator_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  natureza TEXT,
  detalhes TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detalhes)),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_ativa_por_passageiro
  ON reservas (oferta_id, passageiro_id)
  WHERE status = 'CONFIRMADA';

CREATE INDEX IF NOT EXISTS idx_ofertas_estado_saida ON ofertas (estado, data_hora_saida);
CREATE INDEX IF NOT EXISTS idx_ofertas_motorista ON ofertas (motorista_id);
CREATE INDEX IF NOT EXISTS idx_reservas_oferta_status ON reservas (oferta_id, status);
CREATE INDEX IF NOT EXISTS idx_penalidades_usuario ON penalidades (usuario_id);
CREATE INDEX IF NOT EXISTS idx_historico_entidade ON historico_eventos (entidade_tipo, entidade_id);

CREATE TRIGGER IF NOT EXISTS trg_usuarios_matricula_imutavel
BEFORE UPDATE OF matricula ON usuarios
FOR EACH ROW
WHEN OLD.matricula IS NOT NULL AND NEW.matricula <> OLD.matricula
BEGIN
  SELECT RAISE(ABORT, 'matricula imutavel apos validacao');
END;

CREATE TRIGGER IF NOT EXISTS trg_usuarios_matricula_utilizada
AFTER INSERT ON usuarios
FOR EACH ROW
BEGIN
  UPDATE matriculas_autorizadas
  SET utilizada = 1
  WHERE matricula = NEW.matricula;
END;

CREATE TRIGGER IF NOT EXISTS trg_usuarios_atualizado_em
AFTER UPDATE ON usuarios
FOR EACH ROW
BEGIN
  UPDATE usuarios
  SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_recorrencias_atualizado_em
AFTER UPDATE ON recorrencias
FOR EACH ROW
BEGIN
  UPDATE recorrencias
  SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_recorrencias_capacidade_insert
BEFORE INSERT ON recorrencias
FOR EACH ROW
WHEN NEW.vagas > (SELECT capacidade_passageiros FROM veiculos WHERE id = NEW.veiculo_id)
BEGIN
  SELECT RAISE(ABORT, 'vagas excede capacidade_passageiros do veiculo');
END;

CREATE TRIGGER IF NOT EXISTS trg_recorrencias_capacidade_update
BEFORE UPDATE OF vagas, veiculo_id ON recorrencias
FOR EACH ROW
WHEN NEW.vagas > (SELECT capacidade_passageiros FROM veiculos WHERE id = NEW.veiculo_id)
BEGIN
  SELECT RAISE(ABORT, 'vagas excede capacidade_passageiros do veiculo');
END;

CREATE TRIGGER IF NOT EXISTS trg_ofertas_atualizado_em
AFTER UPDATE ON ofertas
FOR EACH ROW
BEGIN
  UPDATE ofertas
  SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ofertas_capacidade_insert
BEFORE INSERT ON ofertas
FOR EACH ROW
WHEN NEW.vagas_total > (SELECT capacidade_passageiros FROM veiculos WHERE id = NEW.veiculo_id)
BEGIN
  SELECT RAISE(ABORT, 'vagas_total excede capacidade_passageiros do veiculo');
END;

CREATE TRIGGER IF NOT EXISTS trg_ofertas_capacidade_update
BEFORE UPDATE OF vagas_total, veiculo_id ON ofertas
FOR EACH ROW
WHEN NEW.vagas_total > (SELECT capacidade_passageiros FROM veiculos WHERE id = NEW.veiculo_id)
BEGIN
  SELECT RAISE(ABORT, 'vagas_total excede capacidade_passageiros do veiculo');
END;

CREATE TRIGGER IF NOT EXISTS trg_ofertas_vagas_minimas_reservadas
BEFORE UPDATE OF vagas_total ON ofertas
FOR EACH ROW
WHEN NEW.vagas_total < (
  SELECT COUNT(*) FROM reservas WHERE oferta_id = NEW.id AND status = 'CONFIRMADA'
)
BEGIN
  SELECT RAISE(ABORT, 'vagas_total nao pode ficar abaixo das reservas confirmadas');
END;

CREATE TRIGGER IF NOT EXISTS trg_reservas_atualizado_em
AFTER UPDATE ON reservas
FOR EACH ROW
BEGIN
  UPDATE reservas
  SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_reservas_capacidade_insert
BEFORE INSERT ON reservas
FOR EACH ROW
WHEN NEW.status = 'CONFIRMADA' AND (
  SELECT COUNT(*) + 1 FROM reservas WHERE oferta_id = NEW.oferta_id AND status = 'CONFIRMADA'
) > (SELECT vagas_total FROM ofertas WHERE id = NEW.oferta_id)
BEGIN
  SELECT RAISE(ABORT, 'capacidade da oferta excedida');
END;

CREATE TRIGGER IF NOT EXISTS trg_reservas_capacidade_update
BEFORE UPDATE OF status, oferta_id ON reservas
FOR EACH ROW
WHEN NEW.status = 'CONFIRMADA' AND (
  SELECT COUNT(*) + 1
  FROM reservas
  WHERE oferta_id = NEW.oferta_id AND status = 'CONFIRMADA' AND id <> NEW.id
) > (SELECT vagas_total FROM ofertas WHERE id = NEW.oferta_id)
BEGIN
  SELECT RAISE(ABORT, 'capacidade da oferta excedida');
END;

CREATE TRIGGER IF NOT EXISTS trg_penalidades_sem_exclusao_conta
BEFORE INSERT ON penalidades
FOR EACH ROW
WHEN lower(NEW.tipo_evento) IN ('cancelamento_exclusao_conta', 'exclusao_conta')
BEGIN
  SELECT RAISE(ABORT, 'cancelamento por exclusao de conta nao gera penalidade');
END;

CREATE TRIGGER IF NOT EXISTS trg_avaliacoes_oferta_concluida_sem_no_show
BEFORE INSERT ON avaliacoes
FOR EACH ROW
WHEN (SELECT estado FROM ofertas WHERE id = NEW.oferta_id) <> 'CONCLUIDA'
  OR EXISTS (
    SELECT 1 FROM reservas WHERE oferta_id = NEW.oferta_id AND status = 'NO_SHOW'
  )
BEGIN
  SELECT RAISE(ABORT, 'avaliacao permitida apenas em viagem concluida sem no-show');
END;
