// index.js
// Telegram Carousel Bot — collects up to 6 photos with captions, posts interactive carousel to channel

require('dotenv').config();
const express = require('express');
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');


const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 9000 });
const CHANNEL_ID = process.env.CHANNEL_ID; // e.g., -1001234567890
const MAX_SLIDES = 6;

const carouselStore = new Map();

// --- Helpers ---------------------------------------------------------------
const ensureSession = (ctx) => {
  if (!ctx.session) ctx.session = {};
  if (!ctx.session.slides) ctx.session.slides = [];
  if (typeof ctx.session.awaitingCaptionFor !== 'string') ctx.session.awaitingCaptionFor = null;
  if (!ctx.session.state) ctx.session.state = 'idle';
};

function captionOf(i, slides) {
  const s = slides[i];
  const total = slides.length;
  return `${s.caption}\n\n<i>${i + 1}/${total}</i>`;
}

function kbNav(key, i, total) {
  const prevCb = i > 0 ? `nav:${key}:${i - 1}` : 'noop';
  const nextCb = i < total - 1 ? `nav:${key}:${i + 1}` : 'noop';
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Oldingi', prevCb), Markup.button.callback('Keyingi ➡️', nextCb)],
  ]);
}

function kbAfterSave(slideCount) {
  const rows = [];
  if (slideCount < MAX_SLIDES) rows.push([Markup.button.callback('➕ Yana rasm qo‘shish', 'more')]);
  rows.push([Markup.button.callback('📤 Kanalga yuborish', 'send')]);
  rows.push([Markup.button.callback('♻️ Yangidan boshlash', 'reset')]);
  return Markup.inlineKeyboard(rows);
}

function isAlbum(msg) {
  return Boolean(msg && msg.media_group_id);
}

function pickBestPhotoFileId(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  return photos[photos.length - 1].file_id;
}

function makeKey(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

// --- Middlewares -----------------------------------------------------------
bot.use(session());

// --- Commands --------------------------------------------------------------
bot.start(async (ctx) => {
  ensureSession(ctx);
  await ctx.reply(
    'Assalomu alaykum! 👋\n\n' +
      'Bu bot orqali 1–6 ta rasm yuborib, har biriga sarlavha yozasiz.\n' +
      'So‘ng “📤 Kanalga yuborish” tugmasi orqali kanalingizda interaktiv carousel chiqadi.\n\n' +
      'Boshlash uchun /new yuboring.',
  );
});

bot.command('new', async (ctx) => {
  ensureSession(ctx);
  ctx.session.slides = [];
  ctx.session.awaitingCaptionFor = null;
  ctx.session.state = 'collecting';
  await ctx.reply('✅ Yangi carousel boshladik. 1-rasmni yuboring.');
});

bot.command('cancel', async (ctx) => {
  ensureSession(ctx);
  ctx.session.slides = [];
  ctx.session.awaitingCaptionFor = null;
  ctx.session.state = 'idle';
  await ctx.reply('❌ Jarayon bekor qilindi. Yangi boshlash uchun /new yuboring.');
});

bot.command('done', async (ctx) => {
  ensureSession(ctx);
  if (!ctx.session.slides.length) return ctx.reply('Hali hech narsa yo‘q. Avval rasm yuboring.');
  await ctx.reply(
    `📦 ${ctx.session.slides.length} ta slayd tayyor. Endi “📤 Kanalga yuborish” tugmasini bosing.`,
    kbAfterSave(ctx.session.slides.length),
  );
});

// --- Collecting photos & captions ----------------------------------------
bot.on('photo', async (ctx) => {
  ensureSession(ctx);

  if (ctx.session.state !== 'collecting') return ctx.reply('Boshlash uchun /new yuboring.');

  if (isAlbum(ctx.message)) {
    return ctx.reply('Iltimos, rasmni bittadan yuboring. Albom qabul qilinmaydi.');
  }

  if (ctx.session.awaitingCaptionFor) {
    return ctx.reply('Avval oldingi rasm uchun sarlavha yozing.');
  }

  if (ctx.session.slides.length >= MAX_SLIDES) {
    return ctx.reply('Maksimal 6 ta slayd to‘plangan.');
  }

  const fileId = pickBestPhotoFileId(ctx.message.photo);
  ctx.session.awaitingCaptionFor = fileId;
  const n = ctx.session.slides.length + 1;
  await ctx.reply(`📝 ${n}-slayd uchun sarlavha yozing.`);
});

bot.on('text', async (ctx) => {
  ensureSession(ctx);
  if (ctx.message.text.startsWith('/')) return;
  if (ctx.session.state !== 'collecting') return;

  const fileId = ctx.session.awaitingCaptionFor;
  if (!fileId) return ctx.reply('Iltimos, avval rasm yuboring.');

  const caption = ctx.message.text.trim();
  ctx.session.slides.push({ fileId, caption });
  ctx.session.awaitingCaptionFor = null;

  const count = ctx.session.slides.length;
  if (count < MAX_SLIDES) {
    await ctx.reply(
      `✅ ${count}-slayd saqlandi. Hozirgi: ${count}/${MAX_SLIDES}.`,
      kbAfterSave(count),
    );
  } else {
    await ctx.reply(
      `✅ ${count}-slayd saqlandi (maksimal). Endi “📤 Kanalga yuborish” tugmasini bosing.`,
      kbAfterSave(count),
    );
  }
});

// --- Inline callbacks -----------------------------------------------------
bot.action('more', async (ctx) => {
  ensureSession(ctx);
  await ctx.answerCbQuery();
  if (ctx.session.slides.length >= MAX_SLIDES) {
    return ctx.reply('6 ta slayd to‘plangan.');
  }
  await ctx.reply('Keyingi rasmingizni yuboring.');
});

bot.action('reset', async (ctx) => {
  ensureSession(ctx);
  ctx.session.slides = [];
  ctx.session.awaitingCaptionFor = null;
  ctx.session.state = 'collecting';
  await ctx.answerCbQuery('Yangidan boshladik');
  await ctx.reply('♻️ Yangidan boshlab, 1-rasmni yuboring.');
});

bot.action('send', async (ctx) => {
  ensureSession(ctx);
  await ctx.answerCbQuery();

  const slides = ctx.session.slides || [];
  if (!slides.length) return ctx.reply('Hali slayd yo‘q.');

  const key = makeKey(8);
  carouselStore.set(key, slides);

  try {
    const i = 0;
    await ctx.telegram.sendPhoto(
      CHANNEL_ID,
      slides[i].fileId,
      {
        caption: captionOf(i, slides),
        parse_mode: 'HTML',
        ...kbNav(key, i, slides.length),
      },
    );

    await ctx.reply('✅ Kanalga yuborildi!');
  } catch (err) {
    console.error('Send error:', err);
    await ctx.reply('❌ Kanalga yuborib bo‘lmadi. Bot admin ekanini tekshiring.');
  }
});

bot.action(/^nav:([a-z0-9]+):([0-9]+)$/i, async (ctx) => {
  const [, key, idxStr] = ctx.match;
  const slides = carouselStore.get(key);
  if (!slides) return ctx.answerCbQuery('Maʼlumot topilmadi.');

  const i = Math.max(0, Math.min(parseInt(idxStr, 10) || 0, slides.length - 1));

  try {
    await ctx.editMessageMedia(
      { type: 'photo', media: slides[i].fileId, caption: captionOf(i, slides), parse_mode: 'HTML' },
      { ...kbNav(key, i, slides.length) },
    );
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('Edit error:', err);
    await ctx.answerCbQuery('Yangilab bo‘lmadi.');
  }
});

bot.action('noop', async (ctx) => ctx.answerCbQuery('Boshqa slayd yo‘q'));

// --- Launch (local or Render) ---------------------------------------------
const app = express();
app.get('/', (req, res) => res.send('ok'));

(async () => {
  try {
    if (process.env.WEBHOOK_URL) {
      const path = `/tg/${bot.secretPathComponent()}`;
      await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}${path}`);
      app.use(bot.webhookCallback(path));
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => console.log('🌐 Webhook server on', PORT));
    } else {
      await bot.launch();
      console.log('🤖 Bot started (long polling)');
    }
  } catch (e) {
    console.error('Launch error:', e);
    process.exit(1);
  }
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
