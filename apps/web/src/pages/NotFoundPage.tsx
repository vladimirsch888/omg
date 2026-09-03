import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button, Card, EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Такой страницы нет"
        description="Ссылка устарела или в адресе опечатка. Вернитесь на дашборд — оттуда есть всё."
        action={
          <Link to="/">
            <Button variant="primary">На дашборд</Button>
          </Link>
        }
      />
    </Card>
  );
}
