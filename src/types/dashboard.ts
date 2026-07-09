/**
 * Dynamic dashboard module config.
 *
 * Stored at /dashboards/{role}/modules/{moduleId}.
 * Admin can add/remove/reorder without a deploy.
 */

export type DashboardIcon =
  | 'briefcase'    // projects
  | 'clipboard'    // forms
  | 'image'        // media
  | 'file-text'    // plans / templates
  | 'clock'        // attendance
  | 'users'        // user management
  | 'shield'       // safety / FLHA
  | 'bell'         // notifications
  | 'bar-chart'    // reports
  | 'calendar'     // timesheet / schedule
  | 'user'         // profile
  | 'settings';

export interface DashboardModule {
  id: string;
  label: string;
  icon: DashboardIcon;
  /** Route path in the (worker) or (admin) group. e.g. `/projects` */
  route: string;
  order: number;
  visible: boolean;
  /**
   * Permission strings required to see the module.
   * Empty array = everyone in the role group sees it.
   */
  requiredPermissions: string[];
  /** Optional accent color hex; defaults to theme primary. */
  color?: string;
  /** Optional short subtitle shown under the label. */
  subtitle?: string;
}
