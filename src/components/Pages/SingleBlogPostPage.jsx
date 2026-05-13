import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import BlogSidebar from './BlogSidebar';
import { blogPosts } from './BlogData';
import OptimizedPicture from '../OptimizedPicture/OptimizedPicture';
import { API_BASE_URL } from '../../config/constants';
import './BlogMainPage.scss';

// Require full format: local@domain.tld with TLD at least 2 chars (e.g. .com, .co.uk)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const BlogCommentSection = ({ postSlug }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios.get(`${API_BASE_URL}/api/blog/${postSlug}/comments`).then((res) => {
      if (!cancelled && res.data?.success) setComments(res.data.comments || []);
    }).catch(() => {
      if (!cancelled) setComments([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [postSlug]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const name = authorName.trim();
      const email = authorEmail.trim();
      const text = message.trim();
      if (!name || !text || !email || submitting) return;
      if (!EMAIL_REGEX.test(email)) return;
      setSubmitting(true);
      setSubmitError('');
      axios.post(`${API_BASE_URL}/api/blog/${postSlug}/comments`, {
        authorName: name,
        authorEmail: email,
        text
      }).then((res) => {
        if (res.data?.success && res.data.comment) {
          setComments((prev) => [res.data.comment, ...prev]);
          setAuthorName('');
          setAuthorEmail('');
          setMessage('');
        }
      }).catch((err) => {
        const msg = err.response?.data?.error || 'Failed to post comment. Use a full email address (e.g. abc@email.com).';
        setSubmitError(msg);
      }).finally(() => setSubmitting(false));
    },
    [authorName, authorEmail, message, postSlug, submitting]
  );

  const formatDate = (date) => {
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
      return '';
    }
  };

  return (
    <section id="comments" className="blog-comments" aria-label="Comments">
      <h2 className="blog-comments-title">
        {loading ? 'Comments' : comments.length === 0 ? 'Comments' : `Comments (${comments.length})`}
      </h2>
      <form className="blog-comment-form" onSubmit={handleSubmit}>
        <div className="blog-comment-form-row">
          <label>
            Name <span aria-hidden="true">*</span>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your name"
              required
            />
          </label>
          <label>
            Email <span aria-hidden="true">*</span>
            <input
              type="email"
              value={authorEmail}
              onChange={(e) => setAuthorEmail(e.target.value)}
              placeholder="abc@email.com"
              pattern="[^\s@]+@[^\s@]+\.[^\s@]{2,}"
              required
              title="Enter a full email address (e.g. abc@email.com). The part after the last dot must be at least 2 letters (e.g. .com, .org)."
            />
          </label>
        </div>
        <label>
          Comment <span aria-hidden="true">*</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your comment..."
            required
          />
        </label>
        {submitError && <p className="blog-comment-error" role="alert">{submitError}</p>}
        <button type="submit" className="blog-comment-submit" disabled={submitting}>
          {submitting ? 'Posting…' : 'Post comment'}
        </button>
      </form>
      {loading ? (
        <p className="blog-comments-empty">Loading comments…</p>
      ) : comments.length > 0 ? (
        <ul className="blog-comments-list">
          {comments.map((c) => (
            <li key={c.id} className="blog-comment-item">
              <p className="blog-comment-meta">
                <span className="blog-comment-author">{c.authorName}</span>
                <span className="blog-comment-date">{formatDate(c.date)}</span>
              </p>
              <p className="blog-comment-text">{c.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="blog-comments-empty">No comments yet. Be the first to share your thoughts.</p>
      )}
    </section>
  );
};

const ArticlePageLayout = ({ post, children }) => {
  return (
    <article className="news-article-page scheme_dark">
      <section className="news-article-hero">
        <div className="news-article-hero-image">
          <OptimizedPicture
            avifSrc={post.image.avif}
            webpSrc={post.image.webp}
            fallbackSrc={post.image.png}
            alt={post.title}
            loading="lazy"
            width={1200}
            height={630}
            sizes="100vw"
          />
        </div>
        <div className="news-article-hero-overlay">
          <span className="news-article-meta">Blog · {post.category}</span>
          <h1 className="news-article-title">{post.title}</h1>
          <p className="news-article-byline">
            By {post.author} · {post.date}
          </p>
        </div>
      </section>

      <div className="news-article-inner">
        <div className="news-article-layout">
          <main className="news-article-main">
            <div className="news-article-body">{children}</div>
            <BlogCommentSection postSlug={post.slug} />
            <div className="news-article-back">
              <Link to="/blog" className="news-article-back-link">
                <span className="news-article-back-arrow">←</span> Back to Blog
              </Link>
            </div>
          </main>

          <BlogSidebar />
        </div>
      </div>
    </article>
  );
};

// ── Islamic Studies ──────────────────────────────────────────────────────────

const BuildingCharacterContent = () => (
  <>
    <p>
      Islamic education is not only about information — it is about transformation. When students study Quran,
      Seerah, and foundational adab together, they begin to build a stable moral compass that guides every
      decision, in school, family life, and online spaces.
    </p>
    <p>
      In our online classrooms, character-building starts with intention (niyyah), consistency, and
      accountability. Learners are encouraged to connect every lesson to lived behavior: honesty in speech,
      patience under pressure, responsibility in group work, and mercy in disagreement.
    </p>
    <h2>Connecting knowledge to action</h2>
    <p>
      Parents and educators can reinforce this growth by pairing knowledge goals with character goals. For
      example, a weekly Quran target can be matched with one practical sunnah habit, turning faith learning
      into action.
    </p>
    <p>
      This approach helps students understand that Islamic studies are not separate from life — they shape how
      we speak, study, collaborate, and serve others.
    </p>
    <h2>Building identity through practice</h2>
    <p>
      Over time, those small consistent habits become identity-level traits: discipline, humility, empathy,
      and leadership rooted in faith. A strong Islamic learning journey prepares students not only for exams
      or certificates, but for trustworthy character in every environment they enter.
    </p>
    <p>
      Our curriculum design combines reflection prompts, applied assignments, and mentor feedback so values
      are practiced, not just memorized.
    </p>
  </>
);

const UnderstandingAqeedahContent = () => (
  <>
    <p>
      Aqeedah — Islamic creed — is the bedrock of every Muslim's faith. It defines who we worship, what we
      believe about the Prophets, the unseen world, divine decree, and the Day of Judgment. Without a clear
      Aqeedah foundation, a student's faith can feel uncertain or vulnerable to doubt.
    </p>
    <p>
      Many learners either approach Aqeedah as dry theology or avoid it entirely. But taught well, it becomes
      one of the most energizing and stabilizing parts of Islamic education.
    </p>
    <h2>Why clarity in belief matters</h2>
    <p>
      When students understand Tawheed deeply — the oneness of Allah in His Lordship, His Names and
      Attributes, and His right to worship — they carry a sense of purpose and calm that shapes every aspect
      of their lives. Clarity in belief reduces anxiety, increases gratitude, and strengthens worship.
    </p>
    <p>
      Our approach to Aqeedah focuses on accessible language, relevant examples, and connection to daily
      worship. Students explore core texts under guided instruction, building confident belief rather than
      memorized statements.
    </p>
    <h2>Aqeedah as a living foundation</h2>
    <p>
      Aqeedah is not a checklist to complete — it is a living orientation to life. When a student truly
      understands that Allah is Al-Aleem (All-Knowing), they approach honesty differently. When they
      internalize Al-Razzaq (the Provider), their relationship with effort and trust changes fundamentally.
    </p>
    <p>
      We teach Aqeedah as the first step in a student's full Islamic education, setting the foundation on
      which all other knowledge — Fiqh, Seerah, Arabic, Quran — builds with clarity and stability.
    </p>
  </>
);

const FiqhBasicsContent = () => (
  <>
    <p>
      Fiqh is the science of Islamic law — the practical guidance that shapes how Muslims perform worship,
      interact with others, earn and spend wealth, and navigate daily decisions. For students, learning
      foundational Fiqh is not optional; it is essential for living Islam consciously.
    </p>
    <p>
      The challenge for many learners is that Fiqh can feel overwhelming due to its breadth and the
      differences of opinion among scholars. A well-structured curriculum removes that overwhelm by starting
      with the essentials that every Muslim uses daily.
    </p>
    <h2>The core pillars to start with</h2>
    <p>
      Every student should first master the Fiqh of purification (Taharah) and prayer (Salah). These are the
      most repeated acts of worship in a Muslim's life and the foundation upon which all other Fiqh study
      builds. From there, students progress to fasting, zakah, and the etiquettes of daily life.
    </p>
    <p>
      Online learning platforms make Fiqh accessible with visual demonstrations, Q&amp;A sessions with
      qualified instructors, and structured modules that allow students to learn at their own pace without
      sacrificing depth.
    </p>
    <h2>Living Fiqh with awareness</h2>
    <p>
      The goal of Fiqh education is not merely compliance — it is conscious, aware worship. When a student
      understands why purification matters, why specific conditions exist for Salah, and how Islamic ethics
      apply to modern transactions, they practice their deen with conviction and confidence.
    </p>
    <p>
      Our Fiqh curriculum draws from well-established scholarly works, presents multiple views where relevant,
      and always connects the ruling to its spiritual purpose.
    </p>
  </>
);

const PropheticMannersContent = () => (
  <>
    <p>
      The Prophet Muhammad (peace be upon him) was described by his wife Aisha as "a walking Quran." His
      character — mercy, honesty, patience, generosity, and humility — was not incidental. It was cultivated,
      practiced, and modeled for all of humanity until the Day of Judgment.
    </p>
    <p>
      For Muslim educators and students, the Prophetic character is not just an inspiration — it is a
      curriculum. Teaching adab (Islamic etiquette) through the lens of the Prophet's life makes character
      education deeply meaningful and grounded.
    </p>
    <h2>Bringing Prophetic manners into digital learning</h2>
    <p>
      Online classrooms present a unique opportunity and challenge. Students interact through screens, which
      can create distance and reduce natural social accountability. Yet this is precisely where Prophetic
      manners become most relevant.
    </p>
    <p>
      When students are taught to greet with Salam, listen with focus, speak with care, and respond with
      patience even in text-based environments, the online classroom becomes a space of adab. These are not
      extra additions to the curriculum — they are the curriculum lived out in real time.
    </p>
    <h2>Practical implementation for educators</h2>
    <p>
      Educators can weave Prophetic manners into every session: begin with Bismillah and a brief reminder of
      intention, close with a practical takeaway from a hadith, and celebrate students who demonstrate
      exemplary character consistently.
    </p>
    <p>
      When adab is modeled by the teacher, students absorb it. When it is celebrated in community, it becomes
      identity. That is the power of Prophetic education.
    </p>
  </>
);

// ── Quranic Arabic ───────────────────────────────────────────────────────────

const QuranicArabicDoorsContent = () => (
  <>
    <p>
      Quranic Arabic opens the door to direct engagement with revelation. Even a modest vocabulary and grammar
      foundation can dramatically increase focus, understanding, and emotional connection during recitation.
    </p>
    <p>
      Many learners think fluency is required before understanding begins. In reality, progress starts with
      key word families, recurring structures, and context-based comprehension practiced consistently each
      week.
    </p>
    <h2>Starting the right way</h2>
    <p>
      A practical online pathway includes memorizing high-frequency Quranic words, learning core grammar
      patterns, and applying them in short ayah analysis. This method keeps momentum high and outcomes
      measurable.
    </p>
    <p>
      As students advance, they begin recognizing the linguistic precision and rhetorical beauty in the
      Quran, which deepens both understanding and reverence.
    </p>
    <h2>From reading to understanding</h2>
    <p>
      Digital tools, spaced repetition, and mentor-led review sessions make Quranic Arabic accessible for
      school-age learners, university students, and working adults alike.
    </p>
    <p>
      The long-term result is powerful: learners move from passive reading to active understanding, bringing
      Quran study closer to daily worship and personal growth.
    </p>
  </>
);

const ArabicVocabularyContent = () => (
  <>
    <p>
      One of the most encouraging discoveries for any Quran learner is this: the Quran uses a relatively
      small number of root words extremely frequently. The most common 200 words appear thousands of times
      across the entire text. Learning them systematically gives you a head start that no other study method
      can match.
    </p>
    <p>
      This does not mean skipping grammar or deep study — but it does mean that vocabulary is the single
      highest-return investment in your Quranic Arabic journey, especially in the early stages.
    </p>
    <h2>How to learn vocabulary that sticks</h2>
    <p>
      Rote memorization fades quickly. The most effective vocabulary learning combines three elements:
      hearing the word in context (inside an ayah), seeing it used across different surahs, and actively
      recalling it through spaced repetition. When all three are present, words embed in long-term memory.
    </p>
    <p>
      Our structured vocabulary modules introduce words in Quranic context from day one. Students do not
      learn words in isolation — they learn them inside the revelation, which makes them both meaningful
      and memorable.
    </p>
    <h2>Progress you can feel</h2>
    <p>
      Students who commit to learning 10 Quranic words per week often report a profound shift within three
      months: they begin recognizing words during Salah, during Quran recitation, and during Islamic talks.
      That moment of recognition is not just intellectual — it is spiritual.
    </p>
    <p>
      When the Quran begins to speak to you in a language you recognize, your connection to it deepens in
      ways that are difficult to describe but impossible to forget.
    </p>
  </>
);

const ArabicGrammarContent = () => (
  <>
    <p>
      Arabic grammar can seem intimidating — with its three-letter roots, verb conjugations, and case
      endings. But for Quranic comprehension, you do not need to master all of Arabic grammar. You need to
      deeply understand the patterns that the Quran uses most frequently. That is a much smaller and more
      achievable goal.
    </p>
    <p>
      The most impactful grammar concepts for Quran readers are: sentence structure (Jumlah Ismiyyah and
      Jumlah Fi'liyyah), the concept of definiteness (the definite article Al-), verb forms in past and
      present tense, and the relationship between doer, verb, and object.
    </p>
    <h2>Learning grammar in Quranic context</h2>
    <p>
      The best way to learn Quranic grammar is not through textbooks alone, but through regular engagement
      with actual ayahs. When a grammar rule is explained using a Quranic example and then seen repeated
      across multiple surahs, comprehension becomes rapid and durable.
    </p>
    <p>
      Our grammar modules are built around Quranic examples exclusively. Every rule is introduced through
      an ayah, explained clearly, and then applied in short comprehension exercises. Students do not just
      learn grammar — they learn how the Quran speaks.
    </p>
    <h2>The beauty of structure</h2>
    <p>
      As students gain grammar awareness, they begin to notice the extraordinary precision of the Quran's
      language. Word choices, verb tenses, and structural arrangements carry deep meaning. Grammar becomes
      not a burden but a key that unlocks layers of Quranic understanding that translation alone cannot
      convey.
    </p>
  </>
);

const ArabicLearningPathContent = () => (
  <>
    <p>
      Every Quran learner starts at a different point. Some can already read Arabic letters; others are
      starting from scratch. Some have studied grammar formally; others have only studied informally through
      listening. Regardless of your starting point, there is a clear and navigable path from where you are
      to reading and understanding the Quran directly.
    </p>
    <p>
      The path has four well-defined stages, and knowing which stage you are in eliminates the confusion
      that causes many learners to stall or quit early.
    </p>
    <h2>Stage one: reading fluency</h2>
    <p>
      The foundation is letter recognition and reading fluency. Before understanding can begin, students
      must be able to read Arabic script fluidly without hesitation. This typically takes six to twelve
      weeks with consistent daily practice.
    </p>
    <h2>Stage two: core vocabulary</h2>
    <p>
      With reading fluency established, the next stage is high-frequency Quranic vocabulary. The goal is
      recognition of the most repeated words across the Quran. At this stage, comprehension begins to
      emerge naturally during recitation.
    </p>
    <h2>Stage three: grammar awareness</h2>
    <p>
      With a vocabulary foundation in place, students begin understanding the structural patterns of Arabic
      sentences. Core grammar concepts are introduced using Quranic examples, building comprehension of
      complete ayahs.
    </p>
    <h2>Stage four: ayah analysis</h2>
    <p>
      In the final stage, students practice reading and analyzing short Quranic passages independently,
      supported by mentor feedback. This is where confidence solidifies and the student's relationship with
      the Quran becomes genuinely direct and personal.
    </p>
  </>
);

// ── Recitation ───────────────────────────────────────────────────────────────

const TajweedForEveryoneContent = () => (
  <>
    <p>
      Enhance your Quranic recitation with our comprehensive Tajweed program. Perfect for beginners and
      advanced learners seeking clarity, correct pronunciation, and confidence in reciting the Quran.
    </p>
    <p>
      Our structured approach covers the rules of Tajweed step by step, from the correct articulation of
      letters (Makharij) to the qualities of letters (Sifaat), and the rules of recitation that bring the
      words of the Quran to life.
    </p>
    <h2>Who can benefit</h2>
    <p>
      Whether you are new to Quranic recitation or looking to refine your existing skills, our Tajweed
      course is designed to meet you where you are and guide you toward excellence in recitation.
    </p>
    <p>
      Tajweed is not reserved for scholars or those with naturally beautiful voices. It is a science
      accessible to every Muslim, designed to protect the integrity of the Quran's pronunciation across
      generations. Learning it is an act of love for the Book of Allah.
    </p>
    <h2>The reward of precise recitation</h2>
    <p>
      The Prophet (peace be upon him) said: "The one who recites the Quran beautifully, smoothly, and
      precisely will be in the company of the noble and obedient angels." This hadith is not about natural
      talent — it is about intentional, studied effort. Tajweed is that effort made into a system.
    </p>
  </>
);

const MakharijContent = () => (
  <>
    <p>
      Every Arabic letter has a precise point of origin in the mouth or throat — its Makhraj (pl.
      Makharij). When letters are pronounced from the wrong location, the meaning of words can change and
      the recitation loses its precision. For this reason, mastering Makharij is the first essential pillar
      of Tajweed study.
    </p>
    <p>
      The Makharij are divided into five main areas: the throat (Al-Jawf and Al-Halq), the tongue (Al-Lisan),
      the lips (Ash-Shafataan), the nasal passage (Al-Khayshoom), and the oral cavity for the extended
      vowels (Al-Jawf). Each area produces a distinct group of letters with specific characteristics.
    </p>
    <h2>Common Makharij mistakes and how to fix them</h2>
    <p>
      Many non-native Arabic speakers confuse letters that sound similar but originate from different
      points. For example, the difference between Haa (ح) and Ha (ه), or between Ain (ع) and Hamza (ء),
      is a matter of Makhraj. Practicing in front of a mirror, recording yourself, and receiving feedback
      from a qualified teacher are the most effective ways to correct these errors.
    </p>
    <h2>Building the habit of correct articulation</h2>
    <p>
      Like any physical skill, correct letter articulation requires repetition before it becomes natural.
      Students who practice Makharij deliberately — even for 10 minutes a day — see significant improvement
      within weeks. The goal is not perfection immediately but consistent forward movement.
    </p>
    <p>
      Once Makharij are established, all subsequent Tajweed rules become easier to apply, because the
      foundation is solid.
    </p>
  </>
);

const NoonMeemRulesContent = () => (
  <>
    <p>
      Among the most important rules in Tajweed are the rules governing the Noon Sakinah (ن with sukoon),
      Tanween (double vowels), and Meem Sakinah (م with sukoon). These letters appear constantly throughout
      the Quran, and knowing how to pronounce them in different contexts is essential for accurate recitation.
    </p>
    <p>
      The four rules of Noon Sakinah and Tanween are: Izhar (clear pronunciation), Idgham (merging),
      Iqlab (conversion), and Ikhfa (concealment). Each rule applies depending on which letter follows the
      Noon or Tanween.
    </p>
    <h2>Understanding each rule with examples</h2>
    <p>
      Izhar applies when one of six throat letters follows: the Noon is pronounced clearly with no
      merging. Idgham applies when specific letters follow — the Noon merges into the next letter with or
      without Ghunnah (nasalization). Iqlab occurs only with the letter Ba — the Noon is converted to a
      Meem sound with Ghunnah. Ikhfa occurs with the remaining letters — the Noon is partially hidden with
      a nasal sound.
    </p>
    <h2>Meem Sakinah rules</h2>
    <p>
      Meem Sakinah has three rules: Ikhfa Shafawi (concealment with Ba), Idgham Shafawi (merging with
      Meem), and Izhar Shafawi (clear pronunciation with all other letters).
    </p>
    <p>
      Memorizing these rules is only the first step. The real learning happens during recitation practice,
      where students apply them in context under teacher supervision. With consistent application, these
      rules become instinctive.
    </p>
  </>
);

const QuranRoutineContent = () => (
  <>
    <p>
      One of the most common struggles in Quran learning is inconsistency. Students often begin with
      enthusiasm, maintain momentum for a few weeks, and then gradually slow down until they stop
      altogether. The solution is not more motivation — it is better structure.
    </p>
    <p>
      A sustainable daily recitation routine is built around three principles: fixed timing, realistic
      quantity, and accountability. When all three are in place, consistency becomes much easier to maintain
      than it is to break.
    </p>
    <h2>Fixed timing: anchor your recitation</h2>
    <p>
      The most effective recitation habits are anchored to an existing daily routine — after Fajr, before
      sleep, or immediately after a specific prayer. When recitation is attached to something you already
      do every day, it no longer requires a separate decision. It simply follows.
    </p>
    <h2>Realistic quantity: start smaller than you think</h2>
    <p>
      Many students fail because they set targets that are too ambitious. Five minutes of focused, correct
      recitation with Tajweed applied is more valuable than thirty minutes of rushed reading. Begin with
      what is genuinely sustainable, then expand gradually as the habit solidifies.
    </p>
    <h2>Accountability: the multiplier</h2>
    <p>
      Reciting to a teacher, a study partner, or an online group dramatically increases consistency and
      quality. Accountability does not mean pressure — it means community. When others know your goal, your
      commitment to it deepens naturally.
    </p>
    <p>
      Over months, a small daily recitation habit becomes one of the most spiritually rewarding parts of
      a student's life. The Quran rewards those who show up for it consistently, day after day.
    </p>
  </>
);

// ── STEM ─────────────────────────────────────────────────────────────────────

const StemFaithContent = () => (
  <>
    <p>
      Faith-integrated STEM education helps students see science as a path to wonder, gratitude, and
      responsibility. The natural world becomes a classroom for curiosity guided by ethics.
    </p>
    <p>
      In our approach, coding, mathematics, and research skills are taught alongside Islamic values such as
      Amanah (trust), Ihsan (excellence), and service to community.
    </p>
    <h2>Why integration matters</h2>
    <p>
      Project-based learning allows students to solve real-world problems while reflecting on ethical
      impact. This builds both technical confidence and principled decision-making.
    </p>
    <p>
      Whether they are designing data models, robotics prototypes, or environmental studies, learners are
      encouraged to ask: how does this knowledge benefit people and honor our responsibilities?
    </p>
    <h2>The long-term vision</h2>
    <p>
      Blending STEM with faith does not reduce scientific rigor — it strengthens purpose. Students remain
      ambitious in innovation while grounded in values that protect integrity. This model prepares a
      generation that can contribute academically and professionally without losing spiritual direction.
    </p>
  </>
);

const MathIslamicArchitectureContent = () => (
  <>
    <p>
      Walk through any great mosque or historic Islamic city, and you will encounter mathematics expressed
      in breathtaking form. The intricate geometric patterns on walls and ceilings, the precise proportions
      of minarets, the symmetry of courtyard designs — none of this was accidental. It was the product of
      deep mathematical knowledge combined with artistic mastery and spiritual intention.
    </p>
    <p>
      Muslim scholars of the Golden Age were pioneers in geometry, algebra, and trigonometry. Figures like
      Al-Khwarizmi (the father of algebra), Ibn Al-Haytham (pioneer of optics and mathematics), and
      Al-Biruni contributed discoveries that shaped the scientific world for centuries. Their work was
      inseparable from their faith — they studied the natural world as a means of understanding its Creator.
    </p>
    <h2>Mathematics as an act of worship</h2>
    <p>
      For the great Muslim architects and scholars, precise measurement was not merely technical — it
      was an expression of Ihsan (excellence) in service of something greater. The eight-fold symmetry
      patterns found across Islamic art reflect the belief that order and beauty in creation point to the
      perfection of the Creator.
    </p>
    <p>
      Teaching students to see mathematics through this lens transforms the subject from a series of
      problems to solve into a language for appreciating the design of the universe.
    </p>
    <h2>Bringing this into modern STEM education</h2>
    <p>
      Educators can use Islamic geometric design as a hands-on mathematics project — students replicate
      traditional patterns using compass and ruler, learning about symmetry, ratios, and angles in the
      process. This approach grounds abstract mathematics in cultural heritage and spiritual meaning.
    </p>
    <p>
      When a student creates an eight-fold geometric pattern and learns it is the same structure found in
      the Alhambra palace, mathematics becomes connected to history, beauty, and identity.
    </p>
  </>
);

const EnvironmentalStewardshipContent = () => (
  <>
    <p>
      The Quran is remarkably rich in its references to the natural world. Oceans, rivers, mountains, wind,
      rain, plants, and animals are mentioned not as background details but as signs (Ayaat) — deliberate
      evidence of divine wisdom and power. The universe itself is a text to be read by those who reflect.
    </p>
    <p>
      Islam's concept of Khilafah (stewardship) places human beings in a position of trust over the Earth.
      We are not owners — we are caretakers. This responsibility extends to every interaction with the
      natural world: how we use water, how we treat animals, how we manage land, and how we approach
      industrial development.
    </p>
    <h2>Environmental ethics in the Sunnah</h2>
    <p>
      The Prophet (peace be upon him) prohibited the wasteful use of water even during ablution, forbade
      the cutting of trees unnecessarily, established green zones around Madinah, and displayed consistent
      mercy toward animals. These are not merely historical anecdotes — they are normative principles for
      how Muslims should relate to the environment.
    </p>
    <h2>Connecting faith to environmental science</h2>
    <p>
      For Muslim STEM students, environmental science is not a secular subject separate from faith — it is
      an expression of it. Studying ecosystems, climate, and sustainable technology becomes an act of
      fulfilling the Khilafah responsibility.
    </p>
    <p>
      When students understand this connection, their engagement with environmental science deepens
      significantly. They are not just studying for a career — they are learning how to honor a trust
      placed in them by Allah.
    </p>
  </>
);

const ProgrammingWithPurposeContent = () => (
  <>
    <p>
      We live in a digital age where code shapes almost every aspect of human experience — how information
      spreads, how communities form, how services are delivered, and how decisions are made. For Muslim
      students entering technology fields, this reality carries both opportunity and responsibility.
    </p>
    <p>
      The opportunity: to build systems that serve people with honesty, efficiency, and justice. The
      responsibility: to ensure that the technology we create does not harm, deceive, exploit, or exclude
      those it touches.
    </p>
    <h2>Islamic values as a framework for ethical coding</h2>
    <p>
      Amanah (trustworthiness) means building software that does what it says it does — no hidden data
      collection, no deceptive design patterns. Adl (justice) means designing systems that are fair and
      accessible to all users regardless of background. Ihsan (excellence) means writing clean, maintainable
      code and delivering quality work consistently.
    </p>
    <p>
      These are not abstract values — they are directly applicable guidelines for how a Muslim software
      developer approaches their craft.
    </p>
    <h2>Building technology for community benefit</h2>
    <p>
      The best projects for Muslim STEM students combine technical skill with community service: apps that
      support Islamic education, tools that assist learning for underserved communities, platforms that make
      Islamic resources more accessible. When technology is built with service as the goal, it becomes a
      form of Sadaqah Jariyah — ongoing benefit that outlasts the builder.
    </p>
    <p>
      Learning to code with purpose does not reduce technical ambition — it directs it toward the right ends.
    </p>
  </>
);

// ── Character ─────────────────────────────────────────────────────────────────

const SeerahModernLifeContent = () => (
  <>
    <p>
      The life of the Prophet (peace be upon him) offers timeless lessons in character, leadership, and
      devotion. Our Islamic Studies program brings Seerah and the stories of the Prophets into focus for
      modern learners.
    </p>
    <p>
      We explore core values from the Quran and Hadith and discuss how to apply Islamic principles in daily
      life — at home, at work, and in the community.
    </p>
    <h2>Living by example</h2>
    <p>
      By studying the Seerah and Prophetic attributes, students gain a framework for integrity, empathy,
      and resilience that remains relevant in every era.
    </p>
    <p>
      The battles of Badr and Uhud teach decision-making under pressure. The migration to Madinah teaches
      sacrifice with long-term vision. The Prophet's daily interactions teach consistency of character in
      ordinary moments. There is no situation a modern student faces that the Seerah does not address.
    </p>
    <h2>Seerah as a personal compass</h2>
    <p>
      When students study the Seerah not as biography but as guidance, they begin asking "what would the
      Prophet do?" in genuine, applied ways. This transforms Seerah from a subject into a living compass
      for navigating modern challenges with Islamic wisdom.
    </p>
  </>
);

const HonestyLearningContent = () => (
  <>
    <p>
      Sidq — truthfulness — is described in the Quran and Sunnah as one of the most fundamental virtues a
      Muslim can possess. The Prophet (peace be upon him) listed it as a pillar of the straight path
      alongside prayer and patience. Yet in the context of education, honesty is often treated as a rule
      to follow rather than a value to develop.
    </p>
    <p>
      When students understand Sidq as a spiritual identity — not just an academic policy — their
      relationship with learning changes fundamentally. They stop optimizing for grades and start optimizing
      for genuine understanding. They report errors honestly, ask questions without embarrassment, and
      acknowledge when they don't know something.
    </p>
    <h2>Honesty in assessment and feedback</h2>
    <p>
      An educational environment that rewards honesty over performance creates far better learners. When
      a student can say "I don't understand this" without fear of judgment, the teacher can actually
      address the gap. When a student accurately self-assesses their progress, they set more realistic and
      effective goals.
    </p>
    <p>
      Gorythm's learning environment is designed around honest progress — students and teachers interact
      with candor, feedback is direct and constructive, and growth is measured against the student's own
      baseline rather than a comparative ranking.
    </p>
    <h2>Sidq as a lifelong practice</h2>
    <p>
      Truthfulness in learning builds truthfulness in life. Students who learn to be honest about their
      gaps in knowledge become professionals who are honest about their limitations. Those who practice
      academic integrity become colleagues and leaders others can trust. Sidq in the classroom is training
      for Sidq everywhere.
    </p>
  </>
);

const PatienceConsistencyContent = () => (
  <>
    <p>
      The Prophet (peace be upon him) said: "The most beloved actions to Allah are those done consistently,
      even if they are small." This single hadith contains a complete philosophy of learning. It is not the
      large effort that builds lasting knowledge — it is the small, consistent one.
    </p>
    <p>
      Sabr (patience) in the context of learning is not passive endurance. It is active commitment in the
      face of difficulty, slow progress, or competing demands on your time. It is choosing to open your
      book again even when you feel like you have not advanced. It is returning to the lesson you found
      difficult rather than moving past it too quickly.
    </p>
    <h2>Designing consistency into your learning</h2>
    <p>
      Consistency does not happen by willpower alone — it is designed. Effective learners build systems:
      a fixed time for study, a specific location, a clear daily goal, and a method for tracking progress.
      When the environment supports the habit, maintaining it requires far less mental energy.
    </p>
    <p>
      In Islamic education specifically, linking study sessions to acts of worship — studying immediately
      after Fajr, reviewing vocabulary after Maghrib — anchors learning to the rhythm of the day in a
      way that reinforces both habit and intention.
    </p>
    <h2>What patience produces</h2>
    <p>
      Students who practice Sabr in learning develop something rare: deep, durable knowledge that is
      genuinely integrated into how they think and act. They do not just pass tests — they carry what they
      have learned into every room they enter.
    </p>
    <p>
      And in Islamic education, that is always the goal — not information transferred, but character formed.
    </p>
  </>
);

const LeadershipSeerahContent = () => (
  <>
    <p>
      Leadership is not a title or a position — it is a way of being. The Seerah of the Prophet Muhammad
      (peace be upon him) is the most comprehensive case study in principled leadership ever recorded. His
      example addresses every challenge that leaders face: building trust, managing conflict, inspiring
      vision, making hard decisions, and maintaining integrity under pressure.
    </p>
    <p>
      For Muslim students who are preparing to lead in any sphere — a classroom, a team, a family, a
      community, or an organization — the Seerah is not optional background reading. It is required study.
    </p>
    <h2>Shura: leading through consultation</h2>
    <p>
      One of the most distinctive leadership qualities of the Prophet was his consistent practice of Shura
      — consultation. He sought the opinions of his companions before major decisions, listened deeply, and
      incorporated their insights even when he had his own view. This modeled that leadership is not about
      having all the answers — it is about drawing the best answers from the people around you.
    </p>
    <p>
      For modern student leaders, this means building teams where every voice matters, making decisions
      transparently, and having the humility to change course when better information emerges.
    </p>
    <h2>Leadership under adversity</h2>
    <p>
      The Seerah records moments of immense difficulty: the loss of loved ones, the betrayal of allies,
      military defeat, and social persecution. In every instance, the Prophet's response was patience,
      strategic clarity, and unwavering trust in Allah. He never reacted from anger alone and never gave
      up on long-term purpose for short-term relief.
    </p>
    <p>
      These are lessons that no business school or leadership program can fully replicate, because they are
      lived with faith as their foundation. When students of Seerah internalize them, they become leaders
      of exceptional character — exactly what our communities need.
    </p>
  </>
);

// ── Slug → Content map ───────────────────────────────────────────────────────

const articleContentMap = {
  // Islamic Studies
  'astronomy-for-all-educational-insights':   BuildingCharacterContent,
  'understanding-aqeedah-for-students':       UnderstandingAqeedahContent,
  'fiqh-basics-for-daily-life':               FiqhBasicsContent,
  'prophetic-manners-for-modern-learners':    PropheticMannersContent,
  // Quranic Arabic
  'cosmic-challenges-help-us-prepare':        QuranicArabicDoorsContent,
  'arabic-vocabulary-for-quran-reading':      ArabicVocabularyContent,
  'understanding-quran-grammar-patterns':     ArabicGrammarContent,
  'from-letters-to-meaning-arabic-path':      ArabicLearningPathContent,
  // Recitation
  'tajweed-for-everyone':                     TajweedForEveryoneContent,
  'mastering-makharij-letter-articulation':   MakharijContent,
  'rules-of-noon-and-meem-in-tajweed':        NoonMeemRulesContent,
  'building-a-quran-recitation-routine':      QuranRoutineContent,
  // STEM
  'zero-gravity-thrills-a-life-of-an-astronaut': StemFaithContent,
  'math-in-islamic-architecture':             MathIslamicArchitectureContent,
  'environmental-stewardship-in-islam':       EnvironmentalStewardshipContent,
  'programming-with-purpose':                 ProgrammingWithPurposeContent,
  // Character
  'seerah-and-modern-life':                   SeerahModernLifeContent,
  'honesty-as-a-learning-value':              HonestyLearningContent,
  'patience-and-consistency-in-study':        PatienceConsistencyContent,
  'leadership-from-the-seerah':               LeadershipSeerahContent,
};

export const SingleBlogPostPage = () => {
  const { slug } = useParams();
  const location = useLocation();
  const post = blogPosts.find((item) => item.slug === slug);
  const Content = articleContentMap[slug];

  useEffect(() => {
    if (location.hash === '#comments') {
      const el = document.getElementById('comments');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, slug]);

  if (!post || !Content) return <Navigate to="/blog" replace />;

  return (
    <ArticlePageLayout post={post}>
      <Content />
    </ArticlePageLayout>
  );
};

export default SingleBlogPostPage;
