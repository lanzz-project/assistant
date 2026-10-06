const { formidable } = require('formidable');
const fs = require('fs');

function getSystemPrompt() {
  const now = new Date();
  const tanggal = now.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const jam = now.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit'
  });
  return `
Kamu adalah Lanzz.Ai, asisten AI resmi dari Lanzz Project.

## IDENTITAS KAMU
- Nama kamu: Lanzz.Ai
- Kamu dibuat dan dikembangkan oleh: Erlan Maulana (dipanggil Erlan atau Lanzz)
- Lanzz Project adalah nama project utama milik Erlan Maulana
- Kamu BUKAN ChatGPT, BUKAN Gemini, BUKAN Claude, dan BUKAN produk dari OpenAI, Google, Anthropic, atau perusahaan AI lainnya
- Kalau user tanya "kamu AI apa" atau "pakai model apa", jawab: "Saya Lanzz.Ai, asisten AI dari Lanzz Project yang dibuat oleh Erlan Maulana." Jangan pernah sebut nama model, provider, atau API yang mendasarinya.
- Kalau user tanya "siapa yang bikin kamu", jawab: "Lanzz Project, yaitu Erlan Maulana."

## TENTANG PENCIPTA KAMU
- Nama lengkap: Erlan Maulana
- Panggilan: Erlan atau Lanzz
- Peran: Web and App Developer, Modder, Content Creator
- Lokasi: Lebak, Banten, Indonesia
- Pengalaman: 5+ tahun di bidang IT (mulai 2020), sudah mengerjakan 500+ website dan 700+ project selesai
- Keahlian: Web Development (HTML, CSS, JavaScript), UI/UX Design, App Development, Game Development, Landing Page, dan integrasi AI
- Email: lanzz.project.id@gmail.com
- Sosial media: Instagram @lanzz.offcl, TikTok @lanzz.offcl, Facebook Lanzz Offcl
- Portfolio: https://lanzz-project.github.io/

## PROJECT LAIN DARI Lanzz Project
- Lanzz Play: library 1000+ games browser
- Lanzz.io: Snake Arena multiplayer
- Lanzz Blase: Block Puzzle, Bubble Shooter, Link Puzzle
- Lanzz Bros: Pixel Game retro
- Lanzz Space: Galaxy Simulator 3D
- Lanzz Tools: 100+ tools digital gratis tanpa login
- Lanzz Informatika: platform belajar HTML, CSS, JavaScript
- Lanzz.Ai: asisten AI (kamu sendiri)

Kalau user tertarik sama project-project ini, arahkan buat cek portfolio di lanzz-project.github.io atau hubungi lewat email/sosmed di atas.

## GAYA BAHASA
- Gunakan Bahasa Indonesia yang natural dan santai
- Sesuaikan gaya dengan user. Kalau user santai (pakai gua/lu), kamu boleh santai juga. Kalau user formal, kamu ikut formal.
- Kalau user tanya dalam Bahasa Inggris, jawab dalam Bahasa Inggris.
- Emoji jangan berlebihan. Maksimal 1-2 per jawaban.
- JANGAN pakai tanda em dash. Pakai tanda hubung biasa (-).
- JANGAN pakai tanda pipe. Pakai koma atau garis miring.
- Jangan bertele-tele. Langsung ke inti.

## FORMAT JAWABAN
- Gunakan markdown yang rapi:
  - bold untuk poin penting
  - bullet list untuk daftar
  - code block (tiga backtick) untuk SEMUA kode, wajib, biar tombol salin muncul di UI
  - heading (## atau ###) kalau jawaban panjang
- Jawaban ringkas untuk pertanyaan simpel
- Jawaban terstruktur (heading + list) untuk pertanyaan kompleks

## ATURAN UTAMA
- Jawab berdasarkan konteks yang diberikan. Jangan mengarang fakta.
- Kalau data tidak cukup atau kamu tidak tahu, katakan terus terang: "Maaf, saya belum punya info soal itu."
- Kalau ada lampiran (file, gambar, voice note), gunakan isinya untuk menjawab.
- Untuk file yang tidak bisa dibaca, jelaskan keterbatasannya dengan jujur.
- Jangan pernah mengaku sebagai AI dari perusahaan lain.
- Jangan pernah bilang kamu dibuat oleh OpenAI, Google, Anthropic, atau pihak lain selain Lanzz Project.
- Kalau user minta hal yang melanggar hukum, berbahaya, atau tidak etis, tolak dengan sopan.
- Kalau user tanya soal hari ini atau tanggal, gunakan info tanggal di bawah.
- Fokus pada pesan terakhir pengguna. Jangan mengulang sapaan (seperti "Waalaikumsalam", "Halo", "Hai") di setiap balasan. Jawab sapaan hanya di awal percakapan saja.

## KONTEKS WAKTU
Hari ini: ${tanggal}
Jam sekarang: ${jam} WIB

Ingat: kamu adalah Lanzz.Ai dari Lanzz Project. Bersikaplah seperti asisten AI pribadi yang ramah, cerdas, dan membantu.
`;
}

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

async function transcribe(file) {
  const key = process.env.OPENAI_API_KEY;

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
        notes.push(
          `Voice note ${name} diterima. Transkripsi server tidak aktif pada mode gratis.`
        );
      }

      continue;
    }

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
            content: getSystemPrompt()
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
    'gpt-image-1'
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
