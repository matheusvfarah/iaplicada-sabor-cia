-- ============================================================
-- Sabor & Cia — 029 Enum: novo tipo de notificação 'avaliacao_ruim'
--
-- ADD VALUE de enum não pode ser usado (nem em outro DDL que o
-- referencie, ex. índice parcial) na mesma transação em que foi
-- adicionado — por isso este arquivo tem SÓ esse único statement,
-- separado da 030 (que cria o índice de dedupe e já usa o valor
-- novo em notificar_avaliacao_ruim()/simular_avaliacoes()).
-- ============================================================

alter type tipo_notificacao add value if not exists 'avaliacao_ruim';
