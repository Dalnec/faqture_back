const pool = require('../db');

const reportError = async (req, res) => {
  try {
    const { client_id, client_name, error_type, document_ref, error_message } = req.body;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    const result = await pool.query(
      'INSERT INTO faqture_errors (client_id, client_name, error_type, document_ref, error_message) VALUES ($1, $2, $3, $4, $3) RETURNING *',
      [client_id, client_name || null, error_type, document_ref, error_message]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getErrors = async (req, res) => {
  try {
    const { client_id, error_type, resolved, limit = 100 } = req.query;
    let sql = 'SELECT * FROM faqture_errors WHERE 1=1';
    const params = [];
    let idx = 1;

    if (client_id) {
      sql += ` AND client_id = $${idx++}`;
      params.push(client_id);
    }
    if (error_type) {
      sql += ` AND error_type = $${idx++}`;
      params.push(error_type);
    }
    if (resolved !== undefined) {
      sql += ` AND resolved = $${idx++}`;
      params.push(resolved === 'true');
    }

    sql += ' ORDER BY created_at DESC';
    if (limit) {
      sql += ` LIMIT $${idx++}`;
      params.push(parseInt(limit));
    }

    const result = await pool.query(sql, params);

    let summarySql = `
      SELECT client_id, client_name, error_type, COUNT(*) as count
      FROM faqture_errors
      WHERE resolved = FALSE
    `;
    const summaryParams = [];
    let sIdx = 1;
    if (client_id) {
      summarySql += ` AND client_id = $${sIdx++}`;
      summaryParams.push(client_id);
    }
    summarySql += ' GROUP BY client_id, client_name, error_type';

    const summary = await pool.query(summarySql, summaryParams);

    res.json({ errors: result.rows, summary: summary.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const resolveError = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE faqture_errors SET resolved = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Error not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getClients = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT client_id, client_name FROM faqture_errors ORDER BY client_name'
    );
    const configClients = await pool.query(
      'SELECT DISTINCT client_id, client_name FROM faqture_config ORDER BY client_name'
    );
    const all = [...result.rows, ...configClients.rows];
    const unique = [...new Map(all.map(c => [c.client_id, c])).values()];
    res.json(unique);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const saveConfigUpdate = async (req, res) => {
  try {
    const { client_id, new_token, new_url } = req.body;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    const result = await pool.query(
      'INSERT INTO config_updates (client_id, new_token, new_url) VALUES ($1, $2, $3) RETURNING *',
      [client_id, new_token, new_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPendingUpdates = async (req, res) => {
  try {
    const { client_id } = req.query;
    let sql = 'SELECT * FROM config_updates WHERE applied = FALSE';
    const params = [];
    let idx = 1;

    if (client_id) {
      sql += ` AND client_id = $${idx++}`;
      params.push(client_id);
    }
    sql += ' ORDER BY created_at ASC';

    const result = await pool.query(sql, params);
    res.json({ updates: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const markUpdateApplied = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE config_updates SET applied = TRUE, applied_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Update not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getConfig = async (req, res) => {
  try {
    const { client_id } = req.query;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    const result = await pool.query(
      'SELECT * FROM faqture_config WHERE client_id = $1',
      [client_id]
    );
    if (result.rows.length === 0) {
      return res.json({ client_id, paused: false });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const pauseService = async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    const existing = await pool.query(
      'SELECT id FROM faqture_config WHERE client_id = $1',
      [client_id]
    );
    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        'INSERT INTO faqture_config (client_id, paused, updated_at) VALUES ($1, TRUE, NOW()) RETURNING *',
        [client_id]
      );
    } else {
      result = await pool.query(
        'UPDATE faqture_config SET paused = TRUE, updated_at = NOW() WHERE client_id = $1 RETURNING *',
        [client_id]
      );
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const resumeService = async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    const existing = await pool.query(
      'SELECT id FROM faqture_config WHERE client_id = $1',
      [client_id]
    );
    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        'INSERT INTO faqture_config (client_id, paused, updated_at) VALUES ($1, FALSE, NOW()) RETURNING *',
        [client_id]
      );
    } else {
      result = await pool.query(
        'UPDATE faqture_config SET paused = FALSE, updated_at = NOW() WHERE client_id = $1 RETURNING *',
        [client_id]
      );
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  reportError,
  getErrors,
  resolveError,
  getClients,
  saveConfigUpdate,
  getPendingUpdates,
  markUpdateApplied,
  getConfig,
  pauseService,
  resumeService,
};
