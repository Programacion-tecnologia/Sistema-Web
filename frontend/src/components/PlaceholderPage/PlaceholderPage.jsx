import Card from "../Card/Card";

export default function PlaceholderPage({ title, description }) {
  return (
    <>
      <h2 className="text-3xl font-bold">{title}</h2>

      <Card className="mt-6 max-w-2xl">
        <p className="text-slate-600">{description}</p>
      </Card>
    </>
  );
}
