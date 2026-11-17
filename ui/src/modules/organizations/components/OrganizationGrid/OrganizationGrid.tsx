import { Row, Col } from "antd";
import OrganizationGridItem from "./OrganizationGridItem";
import "./OrganizationGrid.css";
import { FlatOrganization } from "@/domain/types";

type Props = {
  organizations: FlatOrganization[];
};

export default function OrganizationGrid({ organizations }: Props) {
  return (
    <div className="organization-grid">
      <Row wrap={true} gutter={[8, 8]}>
        {organizations.map((org) => (
          <Col xxl={12} md={24} key={org.id}>
            <OrganizationGridItem organization={org} />
          </Col>
        ))}
      </Row>
    </div>
  );
}
