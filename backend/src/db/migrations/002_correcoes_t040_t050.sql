DROP TRIGGER IF EXISTS trg_ofertas_vagas_minimas_reservadas;
DROP TRIGGER IF EXISTS trg_reservas_capacidade_insert;
DROP TRIGGER IF EXISTS trg_reservas_capacidade_update;
DROP TRIGGER IF EXISTS trg_reservas_status_insert_valido;
DROP TRIGGER IF EXISTS trg_reservas_transicao_status_valida;
DROP TRIGGER IF EXISTS trg_reservas_natureza_cancelamento_valida;

CREATE TRIGGER trg_reservas_status_insert_valido
BEFORE INSERT ON reservas
FOR EACH ROW
WHEN NEW.status <> 'CONFIRMADA' OR NEW.natureza_cancelamento IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'reserva so pode ser criada como CONFIRMADA sem natureza_cancelamento');
END;

CREATE TRIGGER trg_reservas_transicao_status_valida
BEFORE UPDATE OF status ON reservas
FOR EACH ROW
WHEN NOT (
  OLD.status = 'CONFIRMADA' AND NEW.status IN ('CONFIRMADA', 'CANCELADA', 'NO_SHOW')
)
BEGIN
  SELECT RAISE(ABORT, 'transicao de status de reserva invalida');
END;

CREATE TRIGGER trg_reservas_natureza_cancelamento_valida
BEFORE UPDATE OF natureza_cancelamento ON reservas
FOR EACH ROW
WHEN NEW.natureza_cancelamento IS NOT NULL AND NEW.status <> 'CANCELADA'
BEGIN
  SELECT RAISE(ABORT, 'natureza_cancelamento so se aplica a reservas canceladas');
END;

CREATE TRIGGER trg_ofertas_vagas_minimas_reservadas
BEFORE UPDATE OF vagas_total ON ofertas
FOR EACH ROW
WHEN NEW.vagas_total < (
  SELECT COUNT(*) FROM reservas
  WHERE oferta_id = NEW.id AND status IN ('CONFIRMADA', 'NO_SHOW')
)
BEGIN
  SELECT RAISE(ABORT, 'vagas_total nao pode ficar abaixo das reservas ocupantes');
END;

CREATE TRIGGER trg_reservas_capacidade_insert
BEFORE INSERT ON reservas
FOR EACH ROW
WHEN (
  SELECT COUNT(*) + 1 FROM reservas
  WHERE oferta_id = NEW.oferta_id AND status IN ('CONFIRMADA', 'NO_SHOW')
) > (SELECT vagas_total FROM ofertas WHERE id = NEW.oferta_id)
BEGIN
  SELECT RAISE(ABORT, 'capacidade da oferta excedida');
END;

CREATE TRIGGER trg_reservas_capacidade_update
BEFORE UPDATE OF status, oferta_id ON reservas
FOR EACH ROW
WHEN NEW.status IN ('CONFIRMADA', 'NO_SHOW') AND (
  SELECT COUNT(*) + 1
  FROM reservas
  WHERE oferta_id = NEW.oferta_id AND status IN ('CONFIRMADA', 'NO_SHOW') AND id <> NEW.id
) > (SELECT vagas_total FROM ofertas WHERE id = NEW.oferta_id)
BEGIN
  SELECT RAISE(ABORT, 'capacidade da oferta excedida');
END;
