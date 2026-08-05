# Looker KPI cards (gradient-hero style)

Paste-ready HTML for stylized KPI tiles. Each block goes in the LookML `html:` parameter of the matching measure, displayed with the **Single Value** visualization. The icon is loaded from a hosted SVG link. Layout uses nested tables and fixed pixel sizes so it renders correctly even though this Looker instance strips flex/grid layout and container-query units; the gradient fills the tile and the content stays centered at any tile size. Each snippet is indented for readability — the whitespace doesn't affect how it renders.

Icons are referenced from: `https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/` — each card points at `{name}.svg` (e.g. `impressions.svg`). These files must be uploaded and publicly reachable at that location for the icons to show.

## How to use

1. In LookML, add the block below to your measure's `html:` parameter:

   ```lookml
   measure: reach {
     type: sum
     sql: ${TABLE}.reach ;;
     value_format_name: decimal_0
     html: <paste the Reach block here> ;;
   }
   ```
2. Set the tile's visualization to **Single Value**.
3. **Trend chip (optional, off by default):** the trend chip is wrapped in a `{% comment %}...{% endcomment %}` block so the card renders cleanly out of the box. To turn it on, remove those comment tags and replace `your_view.your_trend_measure` with your own trend field's fully-scoped name (e.g. a period-over-period % change measure like `my_view.reach_pop_change`). The chip only appears when that field has a value, and the arrow flips ▲/▼ based on its sign; the reserved space keeps the eyeline whether or not it shows.
4. The measure's own value shows via `{{ rendered_value }}` (use `{{ value }}` for the raw number).

> Note: Looker's HTML filter can be picky. These snippets use inline styles and hosted image links (inline SVG and base64 icons are stripped in this Looker instance), but rendering can vary by Looker version — if a card doesn't fill/scale as expected, that's the thing to check first. If icons don't appear, confirm the SVG links above are uploaded and publicly reachable.

## Snippets

### Clicks

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#8B5CF6,#6C47BF);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/clicks.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                Clicks
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

### CPM

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#0D9488,#0A736A);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/cpm.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                CPM
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

### CTR

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#06B6D4,#048DA5);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/ctr.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                CTR
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

### Frequency

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#6366F1,#4D4FBB);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/frequency.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                Frequency
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

### Impressions

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#14B8A6,#0F8F81);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/impressions.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                Impressions
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

### Reach

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#3B82F6,#2E65BF);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/reach.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                Reach
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

### Revenue

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#22C55E,#1A9949);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/revenue.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                Revenue
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

### Spend

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#F59E0B,#BF7B08);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/spend.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                Spend
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

### VCR

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#EC4899,#B83877);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/vcr.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                VCR
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

### Video Completes

```html
<div style="box-sizing:border-box;width:100%;height:100%;min-height:120px;border-radius:10px;color:#fff;background:linear-gradient(135deg,#F97316,#C25911);font-family:'Helvetica Neue',Arial,sans-serif;">
  <table style="width:100%;height:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;text-align:left;padding:16px 20px 0 20px;color:#fff;">
        <table style="border-collapse:collapse;margin:0;">
          <tr>
            <td style="vertical-align:middle;padding:0;">
              <div style="width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.94);">
                <table style="width:46px;height:46px;border-collapse:collapse;">
                  <tr>
                    <td style="text-align:center;vertical-align:middle;padding:0;line-height:0;font-size:0;">
                      <img src="https://raw.githubusercontent.com/sot10-televisaunivision/looker_televisa_univision/refs/heads/main/kpi-icons/svg/video_completes.svg" width="30" height="30" style="width:30px;height:30px;display:block;margin:0 auto;vertical-align:middle;">
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="vertical-align:middle;padding:0 0 0 11px;text-align:left;">
              <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">
                Video Completes
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="height:100%;vertical-align:middle;text-align:center;padding:6px 20px;color:#fff;">
        <div style="color:#fff;font-size:34px;font-weight:800;line-height:1.05;white-space:nowrap;">
          {{ rendered_value }}
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:26px;vertical-align:bottom;text-align:center;padding:0 20px 16px 20px;">
      {% comment %}
        {% if your_view.your_trend_measure._value != nil %}
        <span style="display:inline-block;color:#fff;font-size:12px;font-weight:700;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:99px;">
          {% if your_view.your_trend_measure._value >= 0 %}▲{% else %}▼{% endif %} {{ your_view.your_trend_measure._rendered_value }}
        </span>
        {% endif %}
      {% endcomment %}
      </td>
    </tr>
  </table>
</div>
```

