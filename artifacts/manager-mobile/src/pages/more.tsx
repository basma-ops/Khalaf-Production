import { Link } from "wouter";
import { useLogoutSession } from "@workspace/api-client-react";
import { 
  Trees, 
  Flag, 
  Calendar, 
  Droplets, 
  CloudRain, 
  Bot, 
  Radio, 
  Shield, 
  Beaker, 
  Activity, 
  LogOut,
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function More() {
  const { toast } = useToast();
  const logout = useLogoutSession();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/";
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Logout failed",
          description: String(err),
        });
      }
    });
  };

  const sections = [
    {
      title: "Intelligence",
      items: [
        { icon: Trees, label: "Groves & Trees", href: "/groves" },
        { icon: CloudRain, label: "Weather", href: "/weather" },
        { icon: Shield, label: "Heritage Rules", href: "/heritage" },
        { icon: Bot, label: "Grove AI", href: "/ai" },
      ]
    },
    {
      title: "Operations",
      items: [
        { icon: Flag, label: "Manager Flags", href: "/flags" },
        { icon: Calendar, label: "Harvest", href: "/harvest" },
        { icon: Droplets, label: "Oil & Lab", href: "/oil" },
      ]
    },
    {
      title: "Records",
      items: [
        { icon: Radio, label: "Sensors", href: "/sensors" },
        { icon: Beaker, label: "Treatments", href: "/treatments" },
        { icon: Activity, label: "Activities", href: "/activities" },
      ]
    }
  ];

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      {sections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-2">
            {section.title}
          </h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            {section.items.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors active:bg-muted"
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="pt-4">
        <button 
          onClick={handleLogout}
          disabled={logout.isPending}
          className="w-full flex items-center justify-center gap-2 p-3 text-sm font-medium text-destructive rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          {logout.isPending ? "Signing out..." : "Sign out"}
        </button>
      </section>
    </div>
  );
}
