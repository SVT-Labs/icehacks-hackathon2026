import { StartPanel } from "@/components/home/StartPanel";
import { Icon, type IconName } from "@/components/Icon";
import { PenguinOnIce } from "@/components/PenguinOnIce";
import { Sea } from "@/components/Sea";
import { SiteHeader } from "@/components/SiteHeader";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "pencil",
    title: "Write two truths",
    text: "Type them or say them aloud. Small ones work best: a food you have never tried, the time you got lost, a strange thing you are good at.",
  },
  {
    icon: "sparkle",
    title: "Pick your lie",
    text: "An AI writes lies in your style and you choose the most believable one. Or write your own, for fewer points.",
  },
  {
    icon: "eye",
    title: "Spot the fake",
    text: "Everyone guesses on a timer. Right guesses score, wrong ones crack your ice, and every reveal ends with a story to ask about.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-5xl gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-14">
          <div>
            <h1 className="text-[2.6rem] font-bold leading-[1.05] sm:text-6xl">
              Two truths, one lie.
              <span className="block text-primary">Don&rsquo;t fall in.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              A party game for friend groups. Everyone writes two true things about
              themselves, an AI forges a third, and your friends have to spot the
              fake. Guess wrong and your ice cracks.
            </p>
            <ul className="mt-6 space-y-2 text-ink">
              {[
                "No accounts and nothing to install: share one link.",
                "Works on phones, tablets and computers.",
                "A game takes about ten minutes.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Icon name="check" className="mt-0.5 shrink-0 text-good" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <StartPanel />
        </section>

        <Sea className="mt-16">
          <div
            className="mx-auto flex max-w-5xl items-end justify-center gap-3 px-4 sm:gap-14"
            style={{ marginTop: -54 }}
          >
            <div className="translate-y-3">
              <PenguinOnIce avatar="coral" cracks={2} size={88} />
            </div>
            <div className="translate-y-6">
              <PenguinOnIce avatar="navy" mood="happy" size={116} />
            </div>
            <div className="translate-y-2">
              <PenguinOnIce avatar="mint" cracks={1} size={88} />
            </div>
          </div>

          <section
            aria-labelledby="how-title"
            className="mx-auto w-full max-w-5xl px-4 pb-14 pt-14 sm:px-6"
          >
            <h2 id="how-title" className="text-3xl font-bold text-white">
              How a round goes
            </h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="rounded-card border-2 border-line bg-surface p-5 text-ink"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-primary">
                      <Icon name={step.icon} />
                    </span>
                    <h3 className="text-xl font-semibold">
                      <span className="text-ink-soft">{index + 1}.</span> {step.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-ink-soft">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <footer className="bg-water-deep">
            <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-white/85 sm:px-6">
              Built for IceHacks 2026 by SVT Labs. A room can only be opened by people
              who have its link, and rooms are deleted after a day.
            </p>
          </footer>
        </Sea>
      </main>
    </>
  );
}
