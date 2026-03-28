<template>
  <PageBackdropHost :frame-mode="frameMode">
    <div class="page history-page app-page">
      <section
        class="history-hero glass-card engine-surface-panel"
        data-engine-surface-key="home-history-hero"
        data-engine-surface-kind="section"
      >
        <div class="hero-copy">
          <p class="eyebrow section-kicker">Activity Archive</p>
          <h1 class="title">往期活动</h1>
          <p class="subtitle">社团代表性培训、展示与经典活动归档</p>
          <p class="lead">
            天码智能社的活动并不只服务于一次报名或一次摆摊，它们共同构成了社团的成长轨迹：有系统培训，有项目展示，也有面向全校的公共活动。这里收录的是当前最能代表社团风格和实践方向的几类往期活动。
          </p>
        </div>

        <aside class="hero-side">
          <article
            class="summary-card glass-card glass-summary engine-surface-panel"
            data-engine-surface-key="home-history-summary-training"
            data-engine-surface-kind="article"
          >
            <span class="card-label section-kicker">代表性培训</span>
            <strong>AI 秋令营</strong>
            <p>以两个月左右的课程和实践组织 AI 入门、AIGC 和工程项目体验。</p>
          </article>
          <article
            class="summary-card glass-card glass-summary engine-surface-panel"
            data-engine-surface-key="home-history-summary-project"
            data-engine-surface-kind="article"
          >
            <span class="card-label section-kicker">特色项目展示</span>
            <strong>像素北科</strong>
            <p>依托元宇宙体素工作坊，让数字孪生校园成为对外展示的核心亮点。</p>
          </article>
          <article
            class="summary-card summary-card-accent glass-card glass-card--accent glass-summary engine-surface-panel"
            data-engine-surface-key="home-history-summary-campus"
            data-engine-surface-kind="article"
          >
            <span class="card-label section-kicker">校内活动</span>
            <strong>百团大战 / 智能文化节</strong>
            <p>将社团技术、作品与互动体验带到线下场景，形成持续传播和招新入口。</p>
          </article>
        </aside>
      </section>

      <section
        class="archive-section glass-card engine-surface-panel"
        data-engine-surface-key="home-history-archive"
        data-engine-surface-kind="section"
      >
        <div class="section-head">
          <p class="section-kicker">重点回顾</p>
          <h2>天码智能社 AI 秋令营</h2>
          <p>
            AI
            秋令营是社团及学院的特色培训项目。完整体现了社团如何把学习内容拆解成课题、平台支持与成果转化三条线并行推进。
          </p>
        </div>

        <div class="track-grid">
          <article
            v-for="(item, index) in campTracks"
            :key="item.title"
            class="track-card glass-card engine-surface-panel"
            :data-engine-surface-key="`home-history-track-card-${index}`"
            data-engine-surface-kind="article"
          >
            <span class="track-tag">{{ item.tag }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
            <p class="track-focus">{{ item.focus }}</p>
          </article>
        </div>

        <div class="support-grid">
          <article
            v-for="(item, index) in campSupport"
            :key="item.title"
            class="support-card glass-card engine-surface-panel"
            :data-engine-surface-key="`home-history-support-card-${index}`"
            data-engine-surface-kind="article"
          >
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </article>
        </div>
      </section>

      <section
        class="timeline-section glass-card engine-surface-panel"
        data-engine-surface-key="home-history-timeline"
        data-engine-surface-kind="section"
      >
        <div class="section-head compact">
          <p class="section-kicker">活动归档</p>
          <h2>往期活动</h2>
        </div>

        <div class="timeline-list">
          <article
            v-for="(item, index) in archiveItems"
            :key="item.title"
            class="timeline-card glass-card engine-surface-panel"
            :data-engine-surface-key="`home-history-timeline-card-${index}`"
            data-engine-surface-kind="article"
          >
            <div class="timeline-bar"></div>
            <div class="timeline-content">
              <p class="timeline-type">{{ item.type }}</p>
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
            </div>
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

const campTracks = [
  {
    tag: 'LLMs',
    title: 'LLMs 在 SOP 流程的灵活应用',
    description:
      '围绕 Prompt 工程与大语言模型调用，分析现有工作流并尝试用 LLM 生成优化后的 SOP 文档。',
    focus: 'Python / Docker / NLP 原理 / 本地部署与调用',
  },
  {
    tag: 'AIGC',
    title: 'AI 图像生成的媒体宣传与工程化应用',
    description: '从图像创作到产品设计自动化，学习多模态模型、Prompt 调优和 AI 图像生成工作流。',
    focus: '机器学习入门 / Stable Diffusion / ComfyUI / 多人协作工作流',
  },
  {
    tag: 'Voxel',
    title: '像素北科工程实践与多智能体交互',
    description: '基于 Minecraft 数字校园项目理解虚拟具身、数字孪生与智能体在空间中的调度交互。',
    focus: '服务器网络 / 三维扫描识别 / 红石电子 / Agent 调度',
  },
]

const campSupport = [
  {
    title: '专业平台与学习指导',
    description:
      '往期课程与 AI Studio 星河社区、Lab4AI 大模型实验室合作，补足算力和实验环境，并提供线下指导。',
  },
  {
    title: '推优与成果转化',
    description: '优秀成员可接入实践团、实验室、教师课题组等更长链路，让作品进一步沉淀或转化。',
  },
  {
    title: '资源支持',
    description: '成员可申请使用本地或云端算力资源，以及 LibLibAI、Lab4AI 等需要算力的平台账号。',
  },
]

const archiveItems = [
  {
    type: 'Brand Project',
    title: '像素北科',
    description:
      '由元宇宙体素工作坊负责，使用 Minecraft 建设体素化电子北科校园，并结合数字孪生技术开展特色活动。',
  },
  {
    type: 'Campus Recruitment',
    title: '百团大战',
    description:
      '每年春季的重要招新活动。社团会策划互动体验、准备周边和特色展示，为社团传播带来持续曝光。',
  },
  {
    type: 'College Showcase',
    title: '智能文化节',
    description:
      '由智能科学与技术学院主办的 AI 文化宣传活动，像素北科项目曾结合 VR 技术在摊位展出，吸引大量关注。',
  },
]
</script>

<style scoped lang="css">
.page {
  --page-max-width: 1520px;
}

.history-page {
  width: min(var(--page-max-width), calc(100% - (var(--page-side-gap) * 2)));
  margin: 0 auto;
  padding: calc(var(--header-height, 64px) + 28px) 0 40px;
  color: var(--el-text-color-primary, #1f2d3d);
}

.history-hero,
.archive-section,
.timeline-section {
  margin-bottom: 24px;
  padding: 28px;
}

.history-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 20px;
}

.hero-copy {
  max-width: 68ch;
}

.title {
  margin: 0 0 8px;
  font-size: clamp(32px, 5vw, 52px);
  line-height: 1.04;
}

.subtitle {
  margin: 0 0 14px;
  color: var(--el-text-color-secondary, rgb(0 0 0 / 62%));
  font-size: 16px;
}

.lead,
.section-head p,
.timeline-content p,
.support-card p,
.track-card p,
.summary-card p {
  margin: 0;
  color: var(--el-text-color-secondary, rgb(0 0 0 / 68%));
  line-height: 1.74;
}

.hero-side {
  display: grid;
  gap: 14px;
}

.summary-card {
  padding: 18px;
}

.card-label,
.track-tag,
.timeline-type {
  display: inline-flex;
  margin-bottom: 10px;
  padding: 5px 9px;
  border: 1px solid var(--theme-border-strong);
  border-radius: 999px;
  background: var(--theme-accent-soft);
  color: var(--theme-accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary-card strong,
.track-card h3,
.support-card h3,
.timeline-content h3,
.section-head h2 {
  margin: 0 0 8px;
  color: var(--el-text-color-primary, inherit);
  line-height: 1.24;
}

.section-head {
  max-width: 72ch;
  margin-bottom: 18px;
}

.section-head.compact {
  max-width: 56ch;
}

.section-head h2 {
  font-size: clamp(24px, 4vw, 34px);
}

.track-grid,
.support-grid {
  display: grid;
  gap: 16px;
}

.track-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 16px;
}

.support-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.track-card,
.support-card {
  padding: 20px;
}

.track-focus {
  margin-top: 12px;
  color: var(--el-text-color-primary, inherit);
  font-size: 13px;
}

.timeline-list {
  display: grid;
  gap: 14px;
}

.timeline-card {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  padding: 18px;
  gap: 14px;
}

.timeline-bar {
  border-radius: 999px;
  background: linear-gradient(180deg, var(--theme-accent), transparent);
}

.timeline-content h3 {
  font-size: 20px;
}

@media (width <= 768px) {
  .history-hero {
    grid-template-columns: 1fr;
  }

  .track-grid,
  .support-grid {
    grid-template-columns: 1fr;
  }
}

@media (width <= 500px) {
  .history-page {
    width: calc(100% - 32px);
    padding: calc(var(--header-height, 64px) + 20px) 0 28px;
  }

  .history-hero,
  .archive-section,
  .timeline-section {
    padding: 20px;
  }
}
</style>
