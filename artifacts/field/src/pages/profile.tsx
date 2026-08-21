import { useAuth } from "@/hooks/use-auth";
import { useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User as UserIcon, Check } from "lucide-react";
import { roleLabel } from "@/lib/i18n";

export default function Profile() {
  const { workerId, setWorkerId } = useAuth();
  const { data: users, isLoading } = useListUsers({ role: "field_worker" });

  return (
    <div className="p-4 pt-8 h-full flex flex-col">
      <h1 className="text-3xl font-bold tracking-tight mb-6">الملف الشخصي</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>اختيار العامل</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            اختر ملفك الشخصي لتحميل مهامك ومتابعة عملك.
          </p>

          {isLoading ? (
            <div className="space-y-3">
              <div className="h-16 bg-muted rounded-xl animate-pulse" />
              <div className="h-16 bg-muted rounded-xl animate-pulse" />
            </div>
          ) : (
            <div className="space-y-3">
              {users?.map((user) => (
                <Button
                  key={user.id}
                  variant={workerId === user.id ? "default" : "outline"}
                  className="w-full h-16 justify-start text-right px-4"
                  onClick={() => setWorkerId(user.id)}
                >
                  <UserIcon className="h-6 w-6 ml-3 opacity-70" />
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{user.name}</div>
                    <div className="text-sm opacity-70">{roleLabel(user.role)}</div>
                  </div>
                  {workerId === user.id && <Check className="h-6 w-6 mr-auto" />}
                </Button>
              ))}
              {users?.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  لا يوجد عمّال ميدانيون.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {workerId && (
        <Button
          variant="destructive"
          size="lg"
          className="w-full h-14 mt-auto"
          onClick={() => setWorkerId(null)}
        >
          تسجيل الخروج
        </Button>
      )}
    </div>
  );
}
