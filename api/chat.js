const { formidable } = require('formidable');
const fs = require('fs');

const SYSTEM_PROMPT = `
Kamu adalah Lanzz.Ai, asisten AI pribadi Lanzz Project.
Gunakan Bahasa Indonesia yang natural dan santai. Sesuaikan gaya user; user santai boleh memakai gua/lu.
Jawab berdasarkan konteks yang diberikan. Jangan mengarang fakta. Jika data tidak cukup, katakan terus terang.
Jika ada lampiran, gunakan isi lampiran yang diekstrak atau gambar yang diberikan.
Untuk file yang tidak bisa dibaca, jelaskan keterbatasannya.
Jawaban ringkas untuk pertanyaan sederhana dan terstruktur untuk pertanyaan kompleks.
`;

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

function field(fields, name, fallback = '') {
  const v = first(fields?.[name]);
  return typeof v === 'string' ? v : fallback;
}

function filesArray(files) {
  const v = files?.files || [];
  return (Array.isArray(v) ? v : [v]).filter(Boolean);
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: true,
      maxFileSize: 25 * 1024 * 1024,
      keepExtensions: true
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function fileBuffer(file) {
  return fs.readFileSync(file.filepath);
}

function dataUrl(file) {
  return `data:${file.mimetype || 'application/octet-stream'};base64,${fileBuffer(file).toString('base64')}`;
}

/*
 * VN GRATIS:
 * Tidak lagi mewajibkan OPENAI_API_KEY.
 *
 * Kalau browser sudah mengubah VN menjadi teks dan mengirim
 * teks tersebut sebagai message, AI tetap bisa memahami VN.
 *
 * Kalau hanya file audio yang masuk tanpa transkrip browser,
 * server tidak akan error. Audio tetap diterima.
 */
async function transcribe(file) {
  const key = process.env.OPENAI_API_KEY;

  // Gratis/fallback: jangan error kalau API key tidak ada.
  if (!key) return '';

  try {
    const form = new FormData();

    form.append(
      'file',
      new Blob(
        [fileBuffer(file)],
        { type: file.mimetype || 'audio/webm' }
      ),
      file.originalFilename || 'voice.webm'
    );

    form.append(
      'model',
      process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'
    );

    form.append('language', 'id');

    const r = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`
        },
        body: form
      }
    );

    const d = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error('OpenAI transcription error:', d);
      return '';
    }

    return d.text || '';
  } catch (err) {
    console.error('Transcription fallback:', err);
    return '';
  }
}

async function extractFile(file) {
  const name = file.originalFilename || 'file';
  const type = file.mimetype || '';
  const size = file.size || 0;

  if (
    type.startsWith('text/') ||
    /\.(txt|md|csv|json|log)$/i.test(name)
  ) {
    const text = fileBuffer(file).toString('utf8');

    return {
      name,
      type,
      size,
      text: text.slice(0, 30000)
    };
  }

  if (
    type === 'application/pdf' ||
    /\.pdf$/i.test(name)
  ) {
    try {
      const pdfParse = require('pdf-parse');
      const out = await pdfParse(fileBuffer(file));

      return {
        name,
        type,
        size,
        text: (out.text || '').slice(0, 30000),
        pages: out.numpages
      };
    } catch (e) {
      return {
        name,
        type,
        size,
        error: 'PDF tidak berhasil diekstrak: ' + e.message
      };
    }
  }

  if (
    type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx$/i.test(name)
  ) {
    try {
      const mammoth = require('mammoth');
      const out = await mammoth.extractRawText({
        buffer: fileBuffer(file)
      });

      return {
        name,
        type,
        size,
        text: (out.value || '').slice(0, 30000)
      };
    } catch (e) {
      return {
        name,
        type,
        size,
        error: 'DOCX tidak berhasil diekstrak: ' + e.message
      };
    }
  }

  if (
    /\.(xlsx|xls)$/i.test(name) ||
    /spreadsheet|excel/i.test(type)
  ) {
    try {
      const XLSX = require('xlsx');

      const wb = XLSX.read(
        fileBuffer(file),
        { type: 'buffer' }
      );

      const parts = [];

      for (const sheet of wb.SheetNames.slice(0, 10)) {
        const csv = XLSX.utils.sheet_to_csv(
          wb.Sheets[sheet]
        );

        parts.push(
          `SHEET: ${sheet}\n${csv.slice(0, 12000)}`
        );
      }

      return {
        name,
        type,
        size,
        text: parts.join('\n\n').slice(0, 30000),
        sheets: wb.SheetNames
      };
    } catch (e) {
      return {
        name,
        type,
        size,
        error:
          'Spreadsheet tidak berhasil dibaca: ' +
          e.message
      };
    }
  }

  return {
    name,
    type,
    size,
    unsupported: true
  };
}

async function callChat({
  message,
  history,
  files
}) {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY belum diatur di environment server.'
    );
  }

  let finalMessage = message || '';

  const content = [];
  const notes = [];
  let transcript = '';

  const extracted = [];

  for (const file of files) {
    const type = file.mimetype || '';
    const name = file.originalFilename || 'file';

    // =========================
    // VOICE NOTE
    // =========================
    if (type.startsWith('audio/')) {
      transcript = await transcribe(file);

      if (transcript) {
        finalMessage = finalMessage
          ? `${finalMessage}\n\n[Transkrip voice]\n${transcript}`
          : transcript;

        notes.push(
          `Voice note ${name} berhasil ditranskrip.`
        );
      } else {
        // PENTING:
        // Tidak throw error kalau OPENAI_API_KEY kosong.
        notes.push(
          `Voice note ${name} diterima. Transkripsi server tidak aktif pada mode gratis.`
        );
      }

      continue;
    }

    // =========================
    // IMAGE
    // =========================
    if (type.startsWith('image/')) {
      if ((file.size || 0) <= 7 * 1024 * 1024) {
        content.push({
          type: 'image_url',
          image_url: {
            url: dataUrl(file)
          }
        });

        notes.push(
          `Gambar ${name} dapat dianalisis.`
        );
      } else {
        notes.push(
          `Gambar ${name} terlalu besar untuk vision.`
        );
      }

      continue;
    }

    // =========================
    // OTHER FILES
    // =========================
    const x = await extractFile(file);

    extracted.push(x);

    if (x.text) {
      notes.push(
        `Isi ${name}:\n${x.text}`
      );
    } else if (x.unsupported) {
      notes.push(
        `File ${name} (${type}) belum didukung untuk ekstraksi isi.`
      );
    } else if (x.error) {
      notes.push(x.error);
    }
  }

  if (finalMessage) {
    content.unshift({
      type: 'text',
      text: finalMessage
    });
  }

  if (notes.length) {
    content.push({
      type: 'text',
      text: '[Lampiran]\n' + notes.join('\n\n')
    });
  }

  if (!content.length) {
    content.push({
      type: 'text',
      text: 'Tolong bantu.'
    });
  }

  const safeHistory = (
    Array.isArray(history)
      ? history
      : []
  )
    .filter(
      x =>
        x &&
        (x.role === 'user' ||
          x.role === 'assistant')
    )
    .slice(-20)
    .map(x => ({
      role: x.role,
      content: String(
        x.content || ''
      ).slice(0, 12000)
    }));

  const r = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer':
          process.env.APP_URL ||
          'http://localhost',
        'X-Title': 'Lanzz.AI'
      },

      body: JSON.stringify({
        model:
          process.env.OPENROUTER_MODEL ||
          'openai/gpt-4.1-mini',

        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },

          ...safeHistory,

          {
            role: 'user',
            content
          }
        ],

        temperature: 0.6,

        max_tokens: Number(
          process.env.OPENROUTER_MAX_TOKENS ||
          1200
        )
      })
    }
  );

  const d = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(
      d.error?.message ||
        'OpenRouter gagal.'
    );
  }

  return {
    reply:
      d.choices?.[0]?.message?.content ||
      'AI tidak memberi jawaban.',

    transcript,

    extracted:
      extracted.map(x => ({
        name: x.name,
        type: x.type,
        size: x.size,
        pages: x.pages,
        sheets: x.sheets,
        error: x.error,
        chars: x.text?.length || 0
      }))
  };
}

async function imageEdit(file, prompt) {
  const key = process.env.OPENAI_API_KEY;

  if (!key) {
    throw new Error(
      'AI edit gambar membutuhkan OPENAI_API_KEY.'
    );
  }

  const form = new FormData();

  form.append(
    'model',
    'gpt-image-2'
  );

  form.append(
    'prompt',
    prompt ||
      'Edit gambar ini sesuai instruksi, pertahankan elemen yang tidak diminta untuk diubah.'
  );

  form.append(
    'image',
    new Blob(
      [
        fileBuffer(file)
      ],
      {
        type:
          file.mimetype ||
          'image/png'
      }
    ),
    file.originalFilename ||
      'image.png'
  );

  form.append(
    'size',
    'auto'
  );

  const r = await fetch(
    'https://api.openai.com/v1/images/edits',
    {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${key}`
      },

      body: form
    }
  );

  const d = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(
      d.error?.message ||
        'AI image edit gagal.'
    );
  }

  const b64 =
    d.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error(
      'AI tidak mengembalikan gambar hasil edit.'
    );
  }

  return {
    dataUrl:
      `data:image/png;base64,${b64}`
  };
}

module.exports = async function handler(
  req,
  res
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({
        error: 'Method not allowed'
      });
  }

  try {
    let fields = {};
    let files = {};

    const ct = String(
      req.headers['content-type'] || ''
    );

    if (
      ct.includes(
        'multipart/form-data'
      )
    ) {
      ({
        fields,
        files
      } = await parseForm(req));
    } else {
      fields = req.body || {};
    }

    const action = field(
      fields,
      'action',
      'chat'
    );

    const uploaded =
      filesArray(files);

    // =========================
    // AI IMAGE EDIT
    // =========================
    if (action === 'image-edit') {
      const image =
        uploaded.find(f =>
          (f.mimetype || '')
            .startsWith('image/')
        );

      if (!image) {
        return res
          .status(400)
          .json({
            error:
              'Gambar untuk diedit belum dikirim.'
          });
      }

      const result =
        await imageEdit(
          image,
          field(
            fields,
            'prompt',
            'Edit gambar ini sesuai instruksi.'
          )
        );

      return res
        .status(200)
        .json(result);
    }

    // =========================
    // HISTORY
    // =========================
    let history = [];

    try {
      history = JSON.parse(
        field(
          fields,
          'history',
          '[]'
        )
      );
    } catch {}

    // =========================
    // CHAT
    // =========================
    const result =
      await callChat({
        message: field(
          fields,
          'message',
          ''
        ).trim(),

        history,

        files: uploaded
      });

    return res
      .status(200)
      .json(result);

  } catch (e) {
    console.error(e);

    return res
      .status(500)
      .json({
        error:
          e.message ||
          'Server error'
      });
  }
};
