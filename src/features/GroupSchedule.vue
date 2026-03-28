<template>
  <PageBackdropHost :frame-mode="frameMode">
    <div class="page">
      <section class="hero">
        <div class="hero-wrap">
          <div class="hero-main">
            <p class="eyebrow">SKYCODE USTB</p>
            <h1 class="title">天码智能社</h1>
            <p class="subtitle">以赛促学，以学促创，围绕 AI 前沿技术组织实践与项目协作</p>

            <p class="lead">
              天码智能社挂靠于智能科学与技术学院，秉承“智融实践，码筑未来”的宗旨，紧密围绕人工智能领域的前沿技术开展学习、交流与实践活动。社团从智能学院首个人工智能专业学习小组
              Fusion Lab 发展而来，持续推动同学从兴趣入门走向项目实践、成果转化与长期协作。
            </p>

            <p class="lead muted">
              这里既有技术培训，也有特色项目与社团活动。你可以从 AI 技术、AIGC
              内容、活动组织、数字校园建设等不同方向进入，再逐步把个人兴趣接入一个更完整的智能科技社群。
            </p>

            <div class="actions">
              <div class="action action-primary">
                <a
                  class="hero-link"
                  href="https://qm.qq.com/q/YPpj5H7YA2"
                  target="_blank"
                  rel="noreferrer"
                >
                  加入社团交流群
                </a>
              </div>
              <div class="action action-primary">
                <a
                  class="hero-link"
                  href="https://qm.qq.com/q/KTv0xoOOkk"
                  target="_blank"
                  rel="noreferrer"
                >
                  加入 USTB Servers
                </a>
              </div>
            </div>
          </div>

          <aside class="hero-cards">
            <article
              class="info info-main engine-surface-panel"
              data-engine-surface-key="home-schedule-hero-info-main"
              data-engine-surface-kind="article"
            >
              <span class="meta">核心部门</span>
              <strong>元宇宙体素工作坊</strong>
              <p>
                以“像素北科”为代表，连接数字孪生、体素建模与多智能体交互，是社团最具辨识度的项目型部门。
              </p>
            </article>

            <div class="hero-row">
              <article
                class="info engine-surface-panel"
                data-engine-surface-key="home-schedule-hero-info-position"
                data-engine-surface-kind="article"
              >
                <span class="meta">社团定位</span>
                <strong>学院 AI 实践社团</strong>
                <p>围绕智能技术、项目协作和成果展示构建持续运转的学习社区。</p>
              </article>
              <article
                class="info info-accent engine-surface-panel"
                data-engine-surface-key="home-schedule-hero-info-featured"
                data-engine-surface-kind="article"
              >
                <span class="meta">代表活动</span>
                <strong>AI 秋令营 / 像素北科</strong>
                <p>一类做系统化培训，一类做长期项目沉淀，形成社团特色内容。</p>
              </article>
            </div>
          </aside>
        </div>
      </section>

      <section
        class="dept engine-surface-panel"
        data-engine-surface-key="home-schedule-dept"
        data-engine-surface-kind="section"
      >
        <div class="head compact">
          <p class="kicker">部门结构</p>
          <h2>四个方向共同构成社团</h2>
        </div>

        <div class="dept-grid">
          <article
            v-for="(item, index) in departments"
            :key="item.title"
            class="dept-card engine-surface-panel"
            :class="{ spotlight: item.spotlight }"
            :data-engine-surface-key="`home-schedule-dept-card-${index}`"
            data-engine-surface-kind="article"
          >
            <span class="badge">{{ item.kind }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </article>
        </div>
      </section>

      <section
        class="lab engine-surface-panel"
        data-engine-surface-key="home-schedule-lab"
        data-engine-surface-kind="section"
      >
        <div class="head compact">
          <p class="kicker">核心部门</p>
          <h2>元宇宙体素工作坊</h2>
        </div>

        <div class="lab-grid">
          <article
            class="card lab-main engine-surface-panel"
            data-engine-surface-key="home-schedule-lab-main"
            data-engine-surface-kind="article"
          >
            <p class="tag">Featured Department</p>
            <h3>以“像素北科”为核心，建设可以被浏览、交互和持续迭代的数字校园</h3>
            <div class="lab-body">
              <p>
                元宇宙体素工作坊由社团品牌特色活动“像素北科”发展成立，旨在通过 Minecraft 建立 3D
                数字智能校园，并在数字校园中引入虚拟具身多智能体等元素，实现元宇宙导航交互。它既是社团对外展示的亮点，也是一个真正持续推进的项目型部门。
              </p>
              <p>
                工作坊前身来自学生自发组织的 USTB Servers
                社区，因此既保留了沙盒平台的创造性，也逐步发展出数字孪生、空间交互和多智能体实验等更完整的工程表达。
              </p>
            </div>

            <div class="lab-note">
              <span>项目关键词</span>
              <p>数字校园 / 数字孪生 / 空间交互 / 多智能体实验</p>
            </div>
          </article>

          <div class="lab-side">
            <article
              class="card side-box engine-surface-panel"
              data-engine-surface-key="home-schedule-lab-side-capabilities"
              data-engine-surface-kind="article"
            >
              <span class="meta">项目能力</span>
              <ul class="list">
                <li v-for="item in abilities" :key="item">{{ item }}</li>
              </ul>
            </article>

            <article
              class="card side-box side-box-accent engine-surface-panel"
              data-engine-surface-key="home-schedule-lab-side-showcase"
              data-engine-surface-kind="article"
            >
              <span class="meta">展示出口</span>
              <h3>百团大战 / 智能文化节 / VR 展示</h3>
              <p>工作坊曾作为社团独特宣传出口在校内活动中广受关注，具有鲜明的学生创新特色。</p>
            </article>
          </div>
        </div>
      </section>

      <section
        class="archive engine-surface-panel"
        data-engine-surface-key="home-schedule-archive"
        data-engine-surface-kind="section"
      >
        <div class="head">
          <p class="kicker">代表性活动</p>
          <h2>AI 秋令营</h2>
          <p>
            AI
            秋令营是天码智能社的代表性培训项目。它属于往期活动，但仍然最能体现社团的课程设计思路：把
            AI 基础、项目实践和多人协作组织成连续两个月左右的训练路径。
          </p>
        </div>

        <div class="archive-grid">
          <article
            v-for="(item, index) in camps"
            :key="item.title"
            class="camp-card engine-surface-panel"
            :data-engine-surface-key="`home-schedule-camp-card-${index}`"
            data-engine-surface-kind="article"
          >
            <span class="badge">{{ item.kind }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
            <p class="mini">{{ item.focus }}</p>
          </article>
        </div>

        <div class="benefits">
          <article
            v-for="(item, index) in benefits"
            :key="item.title"
            class="benefit-card engine-surface-panel"
            :data-engine-surface-key="`home-schedule-benefit-card-${index}`"
            data-engine-surface-kind="article"
          >
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </article>
        </div>
      </section>
    </div>
  </PageBackdropHost>
</template>

<script setup lang="ts">
import PageBackdropHost from '@/components/PageBackdropHost'
import { useFrameMode } from '@/composables/frameMode'

const frameMode = useFrameMode()

const departments = [
  {
    kind: 'Tech',
    title: '技术部',
    description:
      '围绕 AI 技术研究与实践组织技术交流、研究小组和针对性培训，推动技术成果向实际应用转化。',
    spotlight: false,
  },
  {
    kind: 'Media',
    title: '宣传部',
    description: '负责社团品牌形象与活动传播，结合 AIGC 与数字媒体设计制作海报、视频等宣传材料。',
    spotlight: false,
  },
  {
    kind: 'Ops',
    title: '办公室',
    description: '承担社团日常行政、外联协调、成员档案和活动策划，是维持社团高效运转的中枢。',
    spotlight: false,
  },
  {
    kind: 'Core',
    title: '元宇宙体素工作坊',
    description:
      '由“像素北科”发展成立，建设数字智能校园并引入多智能体交互，是社团最鲜明的项目型部门。',
    spotlight: true,
  },
]

const abilities = [
  '体素校园建模与数字孪生表达',
  'Minecraft 服务器搭建与网络联机',
  '三维扫描识别与仿真环境工程建模',
  '红石逻辑、Prompt 工程与智能体调度交互',
]

const camps = [
  {
    kind: 'Track 01',
    title: 'LLMs 在 SOP 流程的灵活应用',
    description:
      '从零入门大语言模型调用，通过 Prompt 工程分析工作流、识别改进点，并用 LLM 生成优化后的 SOP。',
    focus: 'Python / 虚拟环境 / Docker / NLP / 本地部署与调用',
  },
  {
    kind: 'Track 02',
    title: 'AI 图像生成的媒体宣传与工程化应用',
    description: '围绕图像 AIGC、多人协作工作流和产品设计自动化，探索宣传内容与工程产出的结合。',
    focus: '机器学习入门 / 多模态模型 / Stable Diffusion / ComfyUI',
  },
  {
    kind: 'Track 03',
    title: '像素北科工程实践与多智能体交互',
    description:
      '依托元宇宙体素工作坊特色项目，在数字校园场景里理解虚拟具身、数字孪生和多智能体交互。',
    focus: '服务器网络 / 三维识别 / 工程建模 / 红石逻辑 / Agent 调度',
  },
]

const benefits = [
  {
    title: '专业平台与指导',
    description:
      '往期秋令营与 AI Studio 星河社区、Lab4AI 等平台合作，降低了算力和环境门槛，并有线下指导支持。',
  },
  {
    title: '成果转化与推优通道',
    description:
      '优秀成员可获得课题组、实践团、实验室或教师梯队相关推荐机会，让项目成果进入更长链路。',
  },
  {
    title: '资源与伙伴',
    description:
      '活动不仅提供算力与平台账号支持，也帮助参与者建立跨方向协作网络，形成持续学习关系。',
  },
]
</script>

<style scoped lang="css">
.page {
  --page-max-width: 1520px;
  --page-side-gap: clamp(16px, 3vw, 36px);

  min-height: 100vh;
  padding-bottom: 40px;
  transition: color 0.5s ease;
  color: var(--el-text-color, #1f2d3d);
}

.hero,
.dept,
.lab,
.archive {
  position: relative;
  z-index: 1;
  width: min(var(--page-max-width), calc(100% - (var(--page-side-gap) * 2)));
  margin: 0 auto 24px;
}

.hero {
  min-height: 100vh;
  padding-top: calc(var(--header-height, 64px) + 26px);
  padding-bottom: 8px;
}

.hero-wrap {
  display: grid;
  position: relative;
  grid-template-columns: minmax(0, 1.18fr) minmax(360px, 430px);
  align-items: stretch;
  min-height: calc(100vh - var(--header-height, 64px) - 66px);
  padding: clamp(12px, 1.5vw, 20px) 0;
  gap: clamp(26px, 4vw, 52px);
}

.hero-wrap::before {
  content: '';
  position: absolute;
  width: clamp(220px, 26vw, 420px);
  height: clamp(220px, 26vw, 420px);
  border-radius: 999px;
  opacity: 0.55;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--theme-accent) 18%, transparent),
    transparent 68%
  );
  pointer-events: none;
  inset: auto auto -22% -8%;
}

.hero-wrap::after {
  content: '';
  position: absolute;
  opacity: 0.35;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 1%), transparent);
  pointer-events: none;
  inset: 0;
}

.hero-main,
.hero-cards {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.hero-main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 74ch;
  padding: clamp(14px, 1.6vw, 22px) clamp(14px, 1.8vw, 24px);
  border-radius: 28px;
}

.hero-main::before {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in srgb, var(--theme-border-strong) 68%, transparent);
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 4%)),
    color-mix(in srgb, var(--theme-surface-glass) 42%, transparent);
  box-shadow: 0 10px 30px rgb(20 34 66 / 4%);
  backdrop-filter: blur(12px) saturate(116%);
  -webkit-backdrop-filter: blur(12px) saturate(116%);
  pointer-events: none;
}

.hero-main > * {
  position: relative;
  z-index: 1;
}

.hero-cards {
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  gap: 16px;
}

.hero-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.eyebrow,
.kicker,
.tag,
.meta,
.badge {
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.eyebrow,
.kicker,
.tag {
  color: var(--theme-accent);
  font-size: 12px;
  font-weight: 700;
}

.eyebrow {
  margin: 0 0 10px;
}

.title {
  max-width: 10ch;
  margin: 0 0 10px;
  color: var(--theme-text-strong);
  font-size: clamp(42px, 6vw, 84px);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 0.96;
}

.subtitle {
  max-width: 42ch;
  margin: 0 0 18px;
  color: color-mix(in srgb, var(--theme-text-strong) 78%, var(--theme-text-muted));
  font-size: clamp(16px, 1.45vw, 20px);
  line-height: 1.55;
}

.lead {
  max-width: 64ch;
  margin: 0 0 14px;
  color: color-mix(in srgb, var(--theme-text-strong) 72%, var(--theme-text-muted));
  font-size: clamp(14px, 1.1vw, 16px);
  line-height: 1.82;
}

.muted {
  color: color-mix(in srgb, var(--theme-text-strong) 58%, var(--theme-text-subtle));
}

.actions {
  display: flex;
  gap: 16px;
  margin-top: 4px;
}

:global(html.dark) .hero-main::before {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 8%), rgb(255 255 255 / 2%)),
    color-mix(in srgb, var(--theme-surface-glass) 28%, transparent);
  box-shadow: 0 14px 34px rgb(0 0 0 / 18%);
}

.action {
  padding: 12px 18px;
  transition:
    border-color 0.5s ease,
    background 0.5s ease,
    box-shadow 0.5s ease;
  border: 1px solid var(--theme-border-strong);
  border-radius: 14px;
  background: var(--theme-surface-glass);
  box-shadow: var(--theme-shadow-soft);
  font-size: 15px;
  backdrop-filter: blur(10px);
}

.action-primary {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-accent-soft) 120%, transparent),
    var(--theme-surface-glass)
  );
}

.hero-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 46px;
  color: inherit;
  font: inherit;
  text-decoration: none;
}

.info,
.card,
.dept-card,
.camp-card,
.benefit-card {
  border: 1px solid var(--theme-border-soft);
  box-shadow: var(--theme-shadow-soft);
  backdrop-filter: blur(18px) saturate(132%);
}

.info,
.card {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 13%),
    color-mix(in srgb, var(--theme-card-bg) 76%, transparent)
  );
}

.info::before,
.card::before {
  content: '';
  position: absolute;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--theme-accent) 20%, transparent),
    transparent 72%
  );
  pointer-events: none;
  inset: 0 auto auto 0;
}

.info {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 100%;
  padding: 18px 18px 16px;
  border-color: var(--theme-border-strong);
  box-shadow: var(--theme-shadow-hero);
}

.info-main {
  min-height: 140px;
  padding: 16px 18px 14px;
}

.info-accent {
  background: linear-gradient(180deg, rgb(255 255 255 / 2%), var(--theme-card-bg));
}

.hero-row .info {
  min-height: 148px;
}

.meta {
  display: block;
  margin-bottom: 10px;
  color: var(--theme-text-subtle);
  font-size: 12px;
  font-weight: 700;
}

.info strong {
  color: var(--theme-text-strong);
  font-size: clamp(18px, 1.85vw, 24px);
  line-height: 1.18;
}

.hero-row .info strong {
  font-size: clamp(17px, 1.55vw, 20px);
  line-height: 1.28;
}

.info p {
  margin: 8px 0 0;
  color: var(--theme-text-muted);
  font-size: 13px;
  line-height: 1.68;
}

.dept,
.lab,
.archive {
  position: relative;
  padding: 28px;
  overflow: hidden;
  border: 1px solid var(--theme-border-strong);
  border-radius: 22px;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 13%),
    color-mix(in srgb, var(--theme-card-bg) 76%, transparent)
  );
  box-shadow: var(--theme-shadow-hero);
  backdrop-filter: blur(18px) saturate(132%);
}

.dept::before,
.lab::before,
.archive::before,
.dept-card::before,
.camp-card::before,
.benefit-card::before {
  content: '';
  position: absolute;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--theme-accent) 20%, transparent),
    transparent 72%
  );
  pointer-events: none;
  inset: 0 auto auto 0;
}

.head {
  max-width: 72ch;
  margin-bottom: 18px;
}

.head.compact {
  max-width: 56ch;
}

.head h2 {
  margin: 0 0 10px;
  color: var(--theme-text-strong);
  font-size: clamp(24px, 4vw, 34px);
  line-height: 1.14;
}

.head p {
  margin: 0;
  color: var(--theme-text-muted);
  line-height: 1.72;
}

.dept-grid,
.archive-grid,
.benefits {
  display: grid;
  gap: 16px;
}

.dept-grid {
  grid-template-columns: repeat(4, 1fr);
}

.dept-card {
  position: relative;
  padding: 18px 18px 16px;
  overflow: hidden;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.5s ease,
    background 0.5s ease;
  border-radius: 22px;
  border-color: var(--theme-border-strong);
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 13%),
    color-mix(in srgb, var(--theme-card-bg) 76%, transparent)
  );
  box-shadow: var(--theme-shadow-hero);
}

.dept-card.spotlight {
  border-color: var(--theme-border-strong);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-accent-soft) 72%, transparent),
    color-mix(in srgb, var(--theme-card-bg) 74%, transparent)
  );
}

.dept-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 14px 34px rgb(16 24 40 / 12%);
}

.badge {
  display: inline-flex;
  margin-bottom: 12px;
  padding: 5px 9px;
  border: 1px solid var(--theme-border-strong);
  border-radius: 999px;
  background: var(--theme-accent-soft);
  color: var(--theme-accent);
  font-size: 11px;
  font-weight: 700;
}

.dept-card h3,
.camp-card h3,
.benefit-card h3,
.lab-main h3,
.side-box h3 {
  margin: 0 0 10px;
  color: var(--theme-text-strong);
  line-height: 1.24;
}

.dept-card h3 {
  margin-bottom: 6px;
  font-size: 15px;
}

.dept-card p,
.camp-card p,
.benefit-card p,
.lab-main p,
.side-box p,
.list {
  color: var(--theme-text-muted);
}

.dept-card p {
  margin: 0;
  font-size: 13px;
}

.lab-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.16fr) minmax(300px, 0.84fr);
  gap: 18px;
  align-items: start;
}

.card {
  padding: 20px;
}

.lab-main {
  display: grid;
  gap: 18px;
  min-height: 0;
}

.lab-body {
  display: grid;
  gap: 14px;
}

.lab-note {
  padding: 14px 16px;
  border: 1px solid var(--theme-border-soft);
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 10%),
    color-mix(in srgb, var(--theme-card-bg) 76%, transparent)
  );
  backdrop-filter: blur(16px) saturate(128%);
}

.lab-note span {
  display: block;
  margin-bottom: 8px;
  color: var(--theme-text-subtle);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.lab-note p {
  color: var(--theme-text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.tag {
  display: inline-block;
  margin: 0 0 10px;
}

.lab-main p,
.side-box p,
.camp-card p,
.benefit-card p {
  margin: 0;
  line-height: 1.74;
}

.lab-main p + p,
.camp-card .mini {
  margin-top: 12px;
}

.lab-side {
  display: grid;
  grid-template-rows: minmax(0, auto) minmax(0, auto);
  gap: 18px;
}

.side-box {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 0;
}

.side-box-accent {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-accent-soft) 36%, transparent),
    color-mix(in srgb, var(--theme-card-bg) 74%, transparent)
  );
}

.list {
  margin: 6px 0 0;
  padding-left: 18px;
  line-height: 1.7;
}

.list li + li {
  margin-top: 10px;
}

.archive-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 16px;
}

.benefits {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.camp-card,
.benefit-card {
  padding: 20px;
  border-radius: 20px;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 10%),
    color-mix(in srgb, var(--theme-card-bg) 76%, transparent)
  );
}

.mini {
  color: var(--theme-text-strong);
  font-size: 13px;
}

@media (width >= 1600px) {
  .hero-wrap {
    grid-template-columns: minmax(0, 1.12fr) minmax(390px, 450px);
  }

  .hero-main {
    max-width: 78ch;
  }
}

@media (width <= 1180px) {
  .hero-wrap {
    grid-template-columns: minmax(0, 1fr) minmax(310px, 360px);
    gap: 24px;
  }
}

@media (width <= 1080px) {
  .hero-main {
    max-width: 60ch;
  }
}

@media (width <= 768px) {
  .hero {
    min-height: auto;
    padding-bottom: 8px;
  }

  .hero-wrap {
    grid-template-columns: 1fr;
    min-height: auto;
    padding: 0;
    gap: 18px;
  }

  .hero-main {
    padding: 0;
  }

  .hero-cards {
    grid-template-rows: auto;
    gap: 12px;
  }

  .hero-row {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .actions {
    flex-direction: column;
  }

  .dept-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .lab-grid,
  .archive-grid,
  .benefits {
    grid-template-columns: 1fr;
  }
}

@media (width <= 500px) {
  .hero,
  .dept,
  .lab,
  .archive {
    width: calc(100% - 32px);
    margin: 0 auto 18px;
  }

  .dept,
  .lab,
  .archive {
    padding: 20px;
  }

  .dept-grid {
    grid-template-columns: 1fr;
  }
}
</style>
