import GameDesignPanel from "@/components/admin/game-design-panel";

export default function AdminBuilder() {
  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <GameDesignPanel showBackLink />
      </div>
    </div>
  );
}
